use std::sync::Arc;

use axum::Router;
use rmcp::{
    ServerHandler, tool, tool_handler, tool_router,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{ServerCapabilities, ServerInfo},
    schemars,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, session::local::LocalSessionManager,
        tower::StreamableHttpService,
    },
};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::modules::sessions::db::Database;
use crate::modules::sessions::models::{McpStatus, SearchResult, Session, SessionSummary, Stats};
use crate::modules::sessions::{AppResult, SharedDb};

const MCP_BIND_ADDRESS: &str = "127.0.0.1:45139";
pub const MCP_ENDPOINT: &str = "http://127.0.0.1:45139/mcp";
const DEFAULT_LIMIT: usize = 20;
const MAX_LIMIT: usize = 100;

pub struct McpServerState {
    inner: Arc<Mutex<Option<McpServerHandle>>>,
}

struct McpServerHandle {
    cancel: CancellationToken,
    task: JoinHandle<()>,
}

impl Default for McpServerState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }
}

impl McpServerState {
    pub async fn status(&self) -> McpStatus {
        let guard = self.inner.lock().await;
        McpStatus {
            running: guard.is_some(),
            endpoint: MCP_ENDPOINT.to_string(),
        }
    }

    pub async fn set_enabled(&self, db: SharedDb, enabled: bool) -> AppResult<McpStatus> {
        if enabled {
            self.start(db).await?;
        } else {
            self.stop().await;
        }

        Ok(self.status().await)
    }

    async fn start(&self, db: SharedDb) -> AppResult<()> {
        let mut guard = self.inner.lock().await;
        if guard.is_some() {
            return Ok(());
        }

        let cancellation_token = CancellationToken::new();
        let config = StreamableHttpServerConfig::default()
            .with_stateful_mode(false)
            .with_json_response(true)
            .with_sse_keep_alive(None)
            .with_cancellation_token(cancellation_token.child_token());

        let service_db = Arc::clone(&db);
        let service: StreamableHttpService<RecallSessionsMcpServer, LocalSessionManager> =
            StreamableHttpService::new(
                move || Ok(RecallSessionsMcpServer::new(Arc::clone(&service_db))),
                Default::default(),
                config,
            );
        let listener = tokio::net::TcpListener::bind(MCP_BIND_ADDRESS)
            .await
            .map_err(|error| format!("Failed to bind sessions MCP endpoint on {MCP_BIND_ADDRESS}: {error}"))?;
        let router = Router::new().nest_service("/mcp", service);

        let task = tokio::spawn({
            let cancel = cancellation_token.clone();
            async move {
                let _ = axum::serve(listener, router)
                    .with_graceful_shutdown(async move { cancel.cancelled_owned().await })
                    .await;
            }
        });

        *guard = Some(McpServerHandle {
            cancel: cancellation_token,
            task,
        });
        Ok(())
    }

    async fn stop(&self) {
        let handle = {
            let mut guard = self.inner.lock().await;
            guard.take()
        };

        if let Some(handle) = handle {
            handle.cancel.cancel();
            let _ = handle.task.await;
        }
    }
}

#[derive(Clone)]
struct RecallSessionsMcpServer {
    db: SharedDb,
    tool_router: ToolRouter<Self>,
}

impl RecallSessionsMcpServer {
    fn new(db: SharedDb) -> Self {
        Self {
            db,
            tool_router: Self::tool_router(),
        }
    }

    fn with_db<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&Database) -> AppResult<T>,
    {
        let guard = self.db.lock().map_err(|error| error.to_string())?;
        let db = guard
            .as_ref()
            .ok_or_else(|| "Database not initialized".to_string())?;
        f(db)
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListSessionsRequest {
    #[schemars(description = "Maximum number of sessions to return. Defaults to 20.")]
    limit: Option<u32>,
    #[schemars(description = "Filter to a single tool name, for example 'copilot' or 'claude-code'.")]
    tool: Option<String>,
    #[schemars(description = "Filter to a repository or workspace path.")]
    path: Option<String>,
    #[schemars(description = "Optional inclusive lower bound for started_at in RFC3339 format.")]
    date_from: Option<String>,
    #[schemars(description = "Optional inclusive upper bound for started_at in RFC3339 format.")]
    date_to: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SearchSessionsRequest {
    #[schemars(description = "Full-text query over indexed session messages.")]
    query: String,
    #[schemars(description = "Optional single tool filter.")]
    tool: Option<String>,
    #[schemars(description = "Optional repository or workspace path filter.")]
    path: Option<String>,
    #[schemars(description = "Optional inclusive lower bound for started_at in RFC3339 format.")]
    date_from: Option<String>,
    #[schemars(description = "Optional inclusive upper bound for started_at in RFC3339 format.")]
    date_to: Option<String>,
    #[schemars(description = "Maximum number of matches to return. Defaults to 20.")]
    limit: Option<u32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SessionLookupRequest {
    #[schemars(description = "Recall session id.")]
    session_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RelatedSessionsRequest {
    #[schemars(description = "Recall session id to use as the anchor.")]
    session_id: String,
    #[schemars(description = "Maximum number of sessions to return per related bucket. Defaults to 10.")]
    limit: Option<u32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SessionStatsRequest {
    #[schemars(description = "Optional repository or workspace path filter.")]
    path: Option<String>,
}

#[derive(Debug, Serialize)]
struct RelatedSessionsResponse {
    anchor_session: SessionAnchor,
    same_agent: Vec<SessionSummary>,
    same_project: Vec<SessionSummary>,
    other_agents_same_project: Vec<SessionSummary>,
    same_tool: Vec<SessionSummary>,
}

#[derive(Debug, Serialize)]
struct SessionAnchor {
    id: String,
    tool: String,
    agent_slug: String,
    title: Option<String>,
    repo_path: Option<String>,
    workspace: Option<String>,
    started_at: Option<String>,
}

#[tool_router]
impl RecallSessionsMcpServer {
    #[tool(
        name = "list_sessions",
        description = "List recent indexed Recall session summaries. Use this to discover prior sessions by tool, project path, or date range."
    )]
    fn list_sessions(&self, Parameters(args): Parameters<ListSessionsRequest>) -> String {
        self.render_json(self.with_db(|db| {
            let paths = args.path.as_ref().map(|path| vec![path.clone()]);
            db.get_session_summaries(
                args.tool.as_deref(),
                paths.as_deref(),
                args.date_from.as_deref(),
                args.date_to.as_deref(),
                normalize_limit(args.limit, DEFAULT_LIMIT),
                0,
            )
        }))
    }

    #[tool(
        name = "search_sessions",
        description = "Search indexed Recall session transcripts by message content, optionally narrowed by tool, project path, or date range."
    )]
    fn search_sessions(&self, Parameters(args): Parameters<SearchSessionsRequest>) -> String {
        self.render_json(self.with_db(|db| {
            let tools = args.tool.as_ref().map(|tool| vec![tool.clone()]);
            let paths = args.path.as_ref().map(|path| vec![path.clone()]);
            db.search(
                &args.query,
                tools.as_deref(),
                paths.as_deref(),
                args.date_from.as_deref(),
                args.date_to.as_deref(),
                normalize_limit(args.limit, DEFAULT_LIMIT),
            )
        }))
    }

    #[tool(
        name = "get_session_detail",
        description = "Load the full transcript, metadata, and file changes for one Recall session by id."
    )]
    fn get_session_detail(&self, Parameters(args): Parameters<SessionLookupRequest>) -> String {
        self.render_json(self.with_db(|db| {
            let session = db
                .get_session(&args.session_id)?
                .ok_or_else(|| format!("Session '{}' was not found", args.session_id))?;
            Ok(session)
        }))
    }

    #[tool(
        name = "find_related_sessions",
        description = "Find related Recall sessions for an anchor session, grouped by same agent, same project, other agents in the same project, and same tool."
    )]
    fn find_related_sessions(&self, Parameters(args): Parameters<RelatedSessionsRequest>) -> String {
        self.render_json(self.with_db(|db| {
            let anchor = db
                .get_session(&args.session_id)?
                .ok_or_else(|| format!("Session '{}' was not found", args.session_id))?;
            let limit = normalize_limit(args.limit, 10);
            let same_agent = db
                .get_sessions_for_agent(&anchor.agent_slug, limit.saturating_mul(5), 0)?
                .into_iter()
                .filter(|session| session.id != anchor.id)
                .take(limit)
                .collect::<Vec<_>>();

            let project_path = anchor.repo_path.clone().or(anchor.workspace.clone());
            let same_project_seed = if let Some(path) = project_path.as_ref() {
                db.get_session_summaries(
                    None,
                    Some(std::slice::from_ref(path)),
                    None,
                    None,
                    limit.saturating_mul(8),
                    0,
                )?
            } else {
                Vec::new()
            };
            let same_project = same_project_seed
                .iter()
                .filter(|session| session.id != anchor.id)
                .take(limit)
                .cloned()
                .collect::<Vec<_>>();
            let other_agents_same_project = same_project_seed
                .into_iter()
                .filter(|session| session.id != anchor.id && session.agent_slug != anchor.agent_slug)
                .take(limit)
                .collect::<Vec<_>>();
            let same_tool = db
                .get_session_summaries(
                    Some(anchor.tool.as_str()),
                    None,
                    None,
                    None,
                    limit.saturating_mul(5),
                    0,
                )?
                .into_iter()
                .filter(|session| session.id != anchor.id)
                .take(limit)
                .collect::<Vec<_>>();

            Ok(RelatedSessionsResponse {
                anchor_session: SessionAnchor::from(&anchor),
                same_agent,
                same_project,
                other_agents_same_project,
                same_tool,
            })
        }))
    }

    #[tool(
        name = "get_session_stats",
        description = "Get aggregate Recall session counts, optionally scoped to one project path."
    )]
    fn get_session_stats(&self, Parameters(args): Parameters<SessionStatsRequest>) -> String {
        self.render_json(self.with_db(|db| {
            let paths = args.path.as_ref().map(|path| vec![path.clone()]);
            db.get_stats(paths.as_deref())
        }))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for RecallSessionsMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(rmcp::model::Implementation::new("recall-sessions", env!("CARGO_PKG_VERSION")))
            .with_instructions(
                "Use these tools to inspect Recall's indexed session history. Prefer list_sessions or search_sessions first, then load full details with get_session_detail or group nearby work with find_related_sessions.",
            )
    }
}

impl RecallSessionsMcpServer {
    fn render_json<T>(&self, result: AppResult<T>) -> String
    where
        T: Serialize,
    {
        match result {
            Ok(value) => match serde_json::to_string_pretty(&value) {
                Ok(json) => json,
                Err(error) => serde_json::json!({ "error": error.to_string() }).to_string(),
            },
            Err(error) => serde_json::json!({ "error": error }).to_string(),
        }
    }
}

impl From<&Session> for SessionAnchor {
    fn from(session: &Session) -> Self {
        Self {
            id: session.id.clone(),
            tool: session.tool.clone(),
            agent_slug: session.agent_slug.clone(),
            title: session.title.clone(),
            repo_path: session.repo_path.clone(),
            workspace: session.workspace.clone(),
            started_at: session.started_at.clone(),
        }
    }
}

fn normalize_limit(limit: Option<u32>, default: usize) -> usize {
    let limit = limit.map(|value| value as usize).unwrap_or(default);
    limit.clamp(1, MAX_LIMIT)
}

#[allow(dead_code)]
fn _keep_types(_search: SearchResult, _stats: Stats) {}