//! MCP (Model Context Protocol) server for Recall.
//!
//! Exposes Recall's session data to AI agents via the MCP SSE transport.
//! The server listens on `127.0.0.1:<port>` and implements the JSON-RPC 2.0
//! based MCP protocol with tools for searching and browsing sessions.
//!
//! ## Transport
//!
//! Uses the MCP SSE transport:
//! - `GET /sse`       → SSE stream; first event is `endpoint` with the message URL
//! - `POST /message`  → receives JSON-RPC requests; responses flow back via SSE
//!
//! ## Exposed tools
//!
//! | Tool               | Description                              |
//! |--------------------|------------------------------------------|
//! | `search_sessions`  | Full-text search across all sessions     |
//! | `list_sessions`    | List sessions with optional filters      |
//! | `get_session`      | Get full session detail by ID            |
//! | `get_stats`        | Aggregate statistics                     |
//! | `list_tools`       | List detected coding tools / agents      |

use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Query, State as AxumState};
use axum::http::{header, Method, StatusCode};
use axum::response::sse::{Event, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio::sync::Mutex as TokioMutex;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;
use tower_http::cors::{Any, CorsLayer};

use crate::SharedDb;

pub const DEFAULT_PORT: u16 = 23649;

const SERVER_NAME: &str = "recall-mcp";
const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");
const PROTOCOL_VERSION: &str = "2024-11-05";

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

struct McpInner {
    db: SharedDb,
    sessions: TokioMutex<HashMap<String, mpsc::Sender<Event>>>,
}

pub struct McpServer {
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    port: u16,
    inner: Arc<McpInner>,
}

impl McpServer {
    /// Start the MCP server on the given port (localhost only).
    pub async fn start(db: SharedDb, port: u16) -> Result<Self, String> {
        let state = Arc::new(McpInner {
            db,
            sessions: TokioMutex::new(HashMap::new()),
        });

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::POST])
            .allow_headers([header::CONTENT_TYPE, header::ACCEPT]);

        let app = Router::new()
            .route("/sse", get(handle_sse))
            .route("/message", post(handle_message))
            .with_state(Arc::clone(&state))
            .layer(cors);

        let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}"))
            .await
            .map_err(|e| format!("Failed to bind MCP server on port {port}: {e}"))?;

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        let serve_state = Arc::clone(&state);
        tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                })
                .await
                .ok();
            // Clear all sessions when server shuts down
            serve_state.sessions.lock().await.clear();
        });

        eprintln!("[recall] MCP server listening on 127.0.0.1:{port}");

        Ok(McpServer {
            shutdown_tx: Some(shutdown_tx),
            port,
            inner: state,
        })
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
            eprintln!("[recall] MCP server stopped");
        }
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Returns the number of active SSE connections after pruning dead ones.
    pub async fn active_connections(&self) -> usize {
        let mut sessions = self.inner.sessions.lock().await;
        // Prune closed connections (sender is closed when receiver dropped)
        sessions.retain(|_, tx| !tx.is_closed());
        sessions.len()
    }
}

// ---------------------------------------------------------------------------
// SSE transport
// ---------------------------------------------------------------------------

async fn handle_sse(
    AxumState(state): AxumState<Arc<McpInner>>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel::<Event>(64);

    state.sessions.lock().await.insert(session_id.clone(), tx);

    let endpoint_url = format!("/message?sessionId={session_id}");

    let initial = tokio_stream::once(Ok(Event::default().event("endpoint").data(endpoint_url)));

    let messages = ReceiverStream::new(rx).map(Ok);
    let stream = initial.chain(messages);

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("ping"),
    )
}

#[derive(serde::Deserialize)]
struct MessageQuery {
    #[serde(rename = "sessionId")]
    session_id: String,
}

async fn handle_message(
    AxumState(state): AxumState<Arc<McpInner>>,
    Query(query): Query<MessageQuery>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let session_id = &query.session_id;

    let sessions = state.sessions.lock().await;
    let Some(tx) = sessions.get(session_id).cloned() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    drop(sessions);

    // Handle JSON-RPC request
    let response = handle_jsonrpc(&state.db, &body);

    if let Some(resp) = response {
        let event = Event::default()
            .event("message")
            .data(serde_json::to_string(&resp).unwrap_or_default());

        if tx.send(event).await.is_err() {
            // Client disconnected — remove the dead session
            state.sessions.lock().await.remove(session_id);
            return StatusCode::GONE.into_response();
        }
    }

    StatusCode::ACCEPTED.into_response()
}

// ---------------------------------------------------------------------------
// JSON-RPC dispatch
// ---------------------------------------------------------------------------

fn handle_jsonrpc(db: &SharedDb, request: &Value) -> Option<Value> {
    let method = request.get("method")?.as_str()?;
    let id = request.get("id");

    // Notifications (no id) don't get a response
    if method == "notifications/initialized" || method == "notifications/cancelled" {
        return None;
    }

    let params = request.get("params").cloned().unwrap_or(json!({}));

    let result = match method {
        "initialize" => handle_initialize(&params),
        "tools/list" => handle_tools_list(),
        "tools/call" => handle_tools_call(db, &params),
        "ping" => Ok(json!({})),
        _ => Err(json_rpc_error(
            -32601,
            &format!("Method not found: {method}"),
        )),
    };

    let response = match result {
        Ok(result_val) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result_val,
        }),
        Err(error_val) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": error_val,
        }),
    };

    Some(response)
}

fn json_rpc_error(code: i64, message: &str) -> Value {
    json!({ "code": code, "message": message })
}

// ---------------------------------------------------------------------------
// MCP protocol handlers
// ---------------------------------------------------------------------------

fn handle_initialize(_params: &Value) -> Result<Value, Value> {
    Ok(json!({
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {
            "tools": {}
        },
        "serverInfo": {
            "name": SERVER_NAME,
            "version": SERVER_VERSION,
        }
    }))
}

fn handle_tools_list() -> Result<Value, Value> {
    Ok(json!({
        "tools": [
            {
                "name": "search_sessions",
                "description": "Full-text search across all indexed coding sessions. Returns matching sessions with highlighted snippets.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query (FTS5 syntax supported)"
                        },
                        "tool": {
                            "type": "string",
                            "description": "Filter by coding tool name (e.g. 'Claude Code', 'GitHub Copilot')"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results (default 20)",
                            "default": 20
                        }
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "list_sessions",
                "description": "List coding sessions with optional filters. Returns session summaries sorted by most recent first.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "tool": {
                            "type": "string",
                            "description": "Filter by coding tool name"
                        },
                        "date_from": {
                            "type": "string",
                            "description": "ISO 8601 date — only sessions started on or after this date"
                        },
                        "date_to": {
                            "type": "string",
                            "description": "ISO 8601 date — only sessions started on or before this date"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results (default 20)",
                            "default": 20
                        },
                        "offset": {
                            "type": "integer",
                            "description": "Pagination offset (default 0)",
                            "default": 0
                        }
                    }
                }
            },
            {
                "name": "get_session",
                "description": "Get full details for a single coding session including all messages and file changes.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Session ID"
                        }
                    },
                    "required": ["id"]
                }
            },
            {
                "name": "get_stats",
                "description": "Get aggregate statistics: total sessions, total messages, and total unique tools.",
                "inputSchema": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "list_tools",
                "description": "List all coding tools/agents that have indexed sessions.",
                "inputSchema": {
                    "type": "object",
                    "properties": {}
                }
            }
        ]
    }))
}

fn handle_tools_call(db: &SharedDb, params: &Value) -> Result<Value, Value> {
    let tool_name = params
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| json_rpc_error(-32602, "Missing tool name"))?;

    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    match tool_name {
        "search_sessions" => tool_search_sessions(db, &args),
        "list_sessions" => tool_list_sessions(db, &args),
        "get_session" => tool_get_session(db, &args),
        "get_stats" => tool_get_stats(db),
        "list_tools" => tool_list_tools(db),
        _ => Err(json_rpc_error(
            -32602,
            &format!("Unknown tool: {tool_name}"),
        )),
    }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

fn with_db_mcp<F, T: serde::Serialize>(db: &SharedDb, f: F) -> Result<Value, Value>
where
    F: FnOnce(&crate::db::Database) -> Result<T, String>,
{
    let guard = db
        .lock()
        .map_err(|e| json_rpc_error(-32603, &format!("DB lock error: {e}")))?;
    let database = guard
        .as_ref()
        .ok_or_else(|| json_rpc_error(-32603, "Database not initialized"))?;
    let result = f(database).map_err(|e| json_rpc_error(-32603, &e))?;
    let json = serde_json::to_value(&result)
        .map_err(|e| json_rpc_error(-32603, &format!("Serialization error: {e}")))?;
    Ok(json!({
        "content": [{
            "type": "text",
            "text": serde_json::to_string_pretty(&json).unwrap_or_default()
        }]
    }))
}

fn tool_search_sessions(db: &SharedDb, args: &Value) -> Result<Value, Value> {
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| json_rpc_error(-32602, "Missing required parameter: query"))?
        .to_string();

    let tool = args.get("tool").and_then(|v| v.as_str()).map(String::from);
    let tools: Option<Vec<String>> = tool.map(|t| vec![t]);
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(20) as usize;

    with_db_mcp(db, |database| {
        database.search(&query, tools.as_deref(), None, None, None, limit)
    })
}

fn tool_list_sessions(db: &SharedDb, args: &Value) -> Result<Value, Value> {
    let tool = args.get("tool").and_then(|v| v.as_str());
    let date_from = args.get("date_from").and_then(|v| v.as_str());
    let date_to = args.get("date_to").and_then(|v| v.as_str());
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
    let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

    with_db_mcp(db, |database| {
        database.get_session_summaries(tool, date_from, date_to, limit, offset)
    })
}

fn tool_get_session(db: &SharedDb, args: &Value) -> Result<Value, Value> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| json_rpc_error(-32602, "Missing required parameter: id"))?;

    with_db_mcp(db, |database| {
        database
            .get_session(id)?
            .ok_or_else(|| format!("Session not found: {id}"))
    })
}

fn tool_get_stats(db: &SharedDb) -> Result<Value, Value> {
    with_db_mcp(db, |database| database.get_stats())
}

fn tool_list_tools(db: &SharedDb) -> Result<Value, Value> {
    with_db_mcp(db, |database| database.get_tools())
}
