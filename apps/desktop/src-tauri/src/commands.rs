//! All `#[tauri::command]` handlers exposed to the frontend.
//!
//! Commands are grouped by concern: app info, scanning, reads, search,
//! favorites, metadata, and data lifecycle. Each command is intentionally
//! thin — it validates arguments, acquires the DB lock, and delegates to
//! the relevant module (`db`, `indexer`, `exports`).

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};
use ts_rs::TS;

use crate::exports::build_export;
use crate::indexer::Indexer;
use crate::mcp::{self, McpServer};
use crate::models::{ActivityPoint, ExportData, SearchResult, Session, SessionSummary, Stats};
use crate::{persist_scanned_sessions, with_db, AppState};

pub const REPOSITORY_URL: &str = "https://github.com/akhshyganesh/recall";
pub const RELEASES_URL: &str = "https://github.com/akhshyganesh/recall/releases";

type AppResult<T> = Result<T, String>;

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct DetectedSourcePayload {
    pub name: String,
    pub agent_slug: String,
    pub detected: bool,
    pub root_paths: Vec<String>,
    pub evidence: String,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct AppInfoPayload {
    pub current_version: String,
    pub repository_url: String,
    pub releases_url: String,
}

// --- App info ---------------------------------------------------------------

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfoPayload {
    AppInfoPayload {
        current_version: app.package_info().version.to_string(),
        repository_url: REPOSITORY_URL.to_string(),
        releases_url: RELEASES_URL.to_string(),
    }
}

#[tauri::command]
pub fn detect_sources() -> AppResult<Vec<DetectedSourcePayload>> {
    Ok(Indexer::detect_all()
        .into_iter()
        .map(|(name, agent_slug, detection)| DetectedSourcePayload {
            name,
            agent_slug,
            detected: detection.detected,
            root_paths: detection.root_paths,
            evidence: detection.evidence,
        })
        .collect())
}

// --- Scanning ---------------------------------------------------------------

#[tauri::command]
pub async fn scan_all(state: State<'_, AppState>) -> AppResult<usize> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || persist_scanned_sessions(db, None))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn scan_incremental(
    state: State<'_, AppState>,
    since_ts: Option<String>,
) -> AppResult<usize> {
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || persist_scanned_sessions(db, since_ts))
        .await
        .map_err(|err| err.to_string())?
}

// --- Session reads ---------------------------------------------------------

#[tauri::command]
pub fn get_sessions(
    state: State<AppState>,
    tool: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> AppResult<Vec<SessionSummary>> {
    with_db(&state, |db| {
        db.get_session_summaries(
            tool.as_deref(),
            date_from.as_deref(),
            date_to.as_deref(),
            limit.unwrap_or(50),
            offset.unwrap_or(0),
        )
    })
}

#[tauri::command]
pub fn get_session(state: State<AppState>, id: String) -> AppResult<Option<Session>> {
    with_db(&state, |db| db.get_session(&id))
}

#[tauri::command]
pub fn search_sessions(
    state: State<AppState>,
    query: String,
    tools: Option<Vec<String>>,
    paths: Option<Vec<String>>,
    date_from: Option<String>,
    date_to: Option<String>,
    limit: Option<usize>,
) -> AppResult<Vec<SearchResult>> {
    with_db(&state, |db| {
        db.search(
            &query,
            tools.as_deref(),
            paths.as_deref(),
            date_from.as_deref(),
            date_to.as_deref(),
            limit.unwrap_or(50),
        )
    })
}

// --- Favorites & metadata --------------------------------------------------

#[tauri::command]
pub fn toggle_favorite(state: State<AppState>, session_id: String) -> AppResult<bool> {
    with_db(&state, |db| db.toggle_favorite(&session_id))
}

#[tauri::command]
pub fn get_favorites(
    state: State<AppState>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> AppResult<Vec<SessionSummary>> {
    with_db(&state, |db| {
        db.get_favorites(limit.unwrap_or(50), offset.unwrap_or(0))
    })
}

#[tauri::command]
pub fn get_tools(state: State<AppState>) -> AppResult<Vec<String>> {
    with_db(&state, |db| db.get_tools())
}

#[tauri::command]
pub fn get_search_paths(state: State<AppState>) -> AppResult<Vec<String>> {
    with_db(&state, |db| db.get_search_paths())
}

#[tauri::command]
pub fn get_stats(state: State<AppState>) -> AppResult<Stats> {
    with_db(&state, |db| db.get_stats())
}

#[tauri::command]
pub fn get_activity_heatmap(
    state: State<AppState>,
    days: Option<usize>,
) -> AppResult<Vec<ActivityPoint>> {
    with_db(&state, |db| db.get_activity_heatmap(days.unwrap_or(182)))
}

// --- Data lifecycle --------------------------------------------------------

#[tauri::command]
pub fn clear_database(state: State<AppState>) -> AppResult<()> {
    with_db(&state, |db| db.clear_all())
}

#[tauri::command]
pub fn export_session(state: State<AppState>, id: String, format: String) -> AppResult<ExportData> {
    with_db(&state, |db| {
        let session = db
            .get_session(&id)?
            .ok_or_else(|| "Session not found".to_string())?;
        build_export(&session, format.as_str())
    })
}

// --- MCP server ------------------------------------------------------------

#[tauri::command]
pub async fn start_mcp_server(state: State<'_, AppState>, port: Option<u16>) -> AppResult<u16> {
    let port = port.unwrap_or(mcp::DEFAULT_PORT);
    let mut guard = state.mcp.lock().await;

    // Stop existing server if running
    if let Some(mut existing) = guard.take() {
        existing.stop();
    }

    let server = McpServer::start(Arc::clone(&state.db), port)
        .await
        .map_err(|e| e.to_string())?;
    let actual_port = server.port();
    *guard = Some(server);
    Ok(actual_port)
}

#[tauri::command]
pub async fn stop_mcp_server(state: State<'_, AppState>) -> AppResult<()> {
    let mut guard = state.mcp.lock().await;
    if let Some(mut server) = guard.take() {
        server.stop();
    }
    Ok(())
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct McpStatusPayload {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    #[ts(type = "number")]
    pub active_connections: usize,
}

#[tauri::command]
pub async fn get_mcp_status(state: State<'_, AppState>) -> AppResult<McpStatusPayload> {
    let guard = state.mcp.lock().await;
    match guard.as_ref() {
        Some(server) => {
            let port = server.port();
            let active = server.active_connections().await;
            Ok(McpStatusPayload {
                running: true,
                port: Some(port),
                url: Some(format!("http://127.0.0.1:{port}/sse")),
                active_connections: active,
            })
        }
        None => Ok(McpStatusPayload {
            running: false,
            port: None,
            url: None,
            active_connections: 0,
        }),
    }
}
