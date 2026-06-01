use std::sync::Arc;

use axum::Router;
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{ServerCapabilities, ServerInfo},
    schemars,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
    tool, tool_handler, tool_router, ServerHandler,
};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::modules::planner::models::{
    PlannerAccessPolicy, PlannerDocument, PlannerItem, PlannerMcpStatus, PlannerSketch,
    PlannerTimerState,
};
use crate::modules::planner::{store, AppResult};

const MCP_BIND_ADDRESS: &str = "127.0.0.1:45140";
pub const MCP_ENDPOINT: &str = "http://127.0.0.1:45140/mcp";
const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: usize = 200;

pub struct PlannerMcpServerState {
    inner: Arc<Mutex<Option<PlannerMcpServerHandle>>>,
}

struct PlannerMcpServerHandle {
    cancel: CancellationToken,
    task: JoinHandle<()>,
}

impl Default for PlannerMcpServerState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }
}

impl PlannerMcpServerState {
    pub async fn status(&self) -> PlannerMcpStatus {
        let guard = self.inner.lock().await;
        PlannerMcpStatus {
            running: guard.is_some(),
            endpoint: MCP_ENDPOINT.to_string(),
        }
    }

    pub async fn set_enabled(&self, enabled: bool) -> AppResult<PlannerMcpStatus> {
        if enabled {
            self.start().await?;
        } else {
            self.stop().await;
        }

        Ok(self.status().await)
    }

    async fn start(&self) -> AppResult<()> {
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

        let service: StreamableHttpService<RecallPlannerMcpServer, LocalSessionManager> =
            StreamableHttpService::new(
                || Ok(RecallPlannerMcpServer::new()),
                Default::default(),
                config,
            );
        let listener = tokio::net::TcpListener::bind(MCP_BIND_ADDRESS)
            .await
            .map_err(|error| format!("Failed to bind planner MCP endpoint on {MCP_BIND_ADDRESS}: {error}"))?;
        let router = Router::new().nest_service("/mcp", service);

        let task = tokio::spawn({
            let cancel = cancellation_token.clone();
            async move {
                let _ = axum::serve(listener, router)
                    .with_graceful_shutdown(async move { cancel.cancelled_owned().await })
                    .await;
            }
        });

        *guard = Some(PlannerMcpServerHandle {
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
struct RecallPlannerMcpServer {
    tool_router: ToolRouter<Self>,
}

impl RecallPlannerMcpServer {
    fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }

    fn load_document(&self) -> AppResult<PlannerDocument> {
        store::read_document()
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListPlannerItemsRequest {
    #[schemars(description = "Optional status/stage id filter. Uses the user's custom planner stages.")]
    status: Option<String>,
    #[schemars(description = "Include completed items when allowed by the planner access policy.")]
    include_completed: Option<bool>,
    #[schemars(description = "Maximum number of items to return. Defaults to 50.")]
    limit: Option<u32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct PlannerItemLookupRequest {
    #[schemars(description = "Planner item id.")]
    item_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlannerMcpSnapshot {
    updated_at: String,
    access_policy: PlannerAccessPolicy,
    items: Vec<PlannerMcpItem>,
    sketches: Option<Vec<PlannerMcpSketch>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlannerMcpItem {
    id: String,
    title: String,
    status: String,
    priority: String,
    notes: Option<String>,
    start_date: Option<String>,
    deadline: Option<String>,
    tags: Vec<String>,
    estimate_minutes: Option<i64>,
    created_at: String,
    updated_at: String,
    completed_at: Option<String>,
    archived_at: Option<String>,
    timer: Option<PlannerTimerState>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlannerMcpSketch {
    id: String,
    title: String,
    linked_item_id: Option<String>,
    tags: Vec<String>,
    updated_at: Option<String>,
}

#[tool_router]
impl RecallPlannerMcpServer {
    #[tool(
        name = "get_planner_access_policy",
        description = "Read the current planner access policy that controls what this MCP may expose."
    )]
    fn get_planner_access_policy(&self) -> String {
        self.render_json(self.load_document().map(|document| document.access_policy))
    }

    #[tool(
        name = "list_planner_items",
        description = "List planner items visible through the user's access policy. Notes and timer details are omitted unless allowed."
    )]
    fn list_planner_items(&self, Parameters(args): Parameters<ListPlannerItemsRequest>) -> String {
        self.render_json(self.load_document().map(|document| {
            let limit = normalize_limit(args.limit, DEFAULT_LIMIT);
            visible_items(
                &document,
                args.include_completed.unwrap_or(false),
                args.status.as_deref(),
            )
            .into_iter()
            .take(limit)
            .collect::<Vec<_>>()
        }))
    }

    #[tool(
        name = "get_planner_item",
        description = "Get one planner item by id, filtered by the user's access policy."
    )]
    fn get_planner_item(&self, Parameters(args): Parameters<PlannerItemLookupRequest>) -> String {
        self.render_json(self.load_document().and_then(|document| {
            visible_items(&document, true, None)
                .into_iter()
                .find(|item| item.id == args.item_id)
                .ok_or_else(|| format!("Planner item '{}' was not found or is hidden by policy", args.item_id))
        }))
    }

    #[tool(
        name = "get_planner_snapshot",
        description = "Get the full planner snapshot allowed by the user's access policy, including sketch names, tags, and linked planner items only when sketch access is enabled."
    )]
    fn get_planner_snapshot(&self) -> String {
        self.render_json(self.load_document().map(|document| visible_snapshot(&document)))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for RecallPlannerMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(rmcp::model::Implementation::new(
                "recall-planner",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions(
                "Use these tools to inspect the user's Recall planner only within the active access policy. Prefer list_planner_items first, then get_planner_item for detail. Respect omitted notes, timer details, completed items, and sketches as intentional policy boundaries.",
            )
    }
}

impl RecallPlannerMcpServer {
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

fn visible_snapshot(document: &PlannerDocument) -> PlannerMcpSnapshot {
    PlannerMcpSnapshot {
        updated_at: document.updated_at.clone(),
        access_policy: document.access_policy.clone(),
        items: visible_items(document, false, None),
        sketches: visible_sketches(document, &document.access_policy),
    }
}

fn visible_items(
    document: &PlannerDocument,
    include_completed_request: bool,
    status: Option<&str>,
) -> Vec<PlannerMcpItem> {
    if !document.access_policy.expose_items {
        return Vec::new();
    }

    let include_completed = include_completed_request && document.access_policy.include_completed;
    let done_status_id = document.settings.done_status_id.as_str();
    document
        .items
        .iter()
        .filter(|item| item.archived_at.is_none())
        .filter(|item| include_completed || item.status != done_status_id)
        .filter(|item| status.map(|s| item.status == s).unwrap_or(true))
        .map(|item| visible_item(item, &document.access_policy))
        .collect()
}

fn visible_item(item: &PlannerItem, policy: &PlannerAccessPolicy) -> PlannerMcpItem {
    PlannerMcpItem {
        id: item.id.clone(),
        title: item.title.clone(),
        status: item.status.clone(),
        priority: item.priority.clone(),
        notes: policy.expose_notes.then(|| item.notes.clone()),
        start_date: item.start_date.clone(),
        deadline: item.deadline.clone(),
        tags: item.tags.clone(),
        estimate_minutes: item.estimate_minutes,
        created_at: item.created_at.clone(),
        updated_at: item.updated_at.clone(),
        completed_at: item.completed_at.clone(),
        archived_at: item.archived_at.clone(),
        timer: policy.expose_timers.then(|| item.timer.clone()),
    }
}

fn visible_sketches(
    document: &PlannerDocument,
    policy: &PlannerAccessPolicy,
) -> Option<Vec<PlannerMcpSketch>> {
    policy.expose_sketches.then(|| {
        visible_document_sketches(document)
            .into_iter()
            .map(|sketch| PlannerMcpSketch {
                id: sketch.id.clone(),
                title: sketch.title.clone(),
                linked_item_id: sketch.linked_item_id.clone(),
                tags: sketch.tags.clone(),
                updated_at: sketch.updated_at.clone(),
            })
            .collect()
    })
}

fn visible_document_sketches(document: &PlannerDocument) -> Vec<&PlannerSketch> {
    if document.sketches.is_empty() {
        vec![&document.sketch]
    } else {
        document.sketches.iter().collect()
    }
}

fn normalize_limit(limit: Option<u32>, default: usize) -> usize {
    let limit = limit.map(|value| value as usize).unwrap_or(default);
    limit.clamp(1, MAX_LIMIT)
}
