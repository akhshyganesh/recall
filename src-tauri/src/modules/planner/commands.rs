use tauri::State;

use crate::modules::planner::models::{PlannerDocument, PlannerMcpStatus};
use crate::modules::planner::{store, AppResult, PlannerState};

#[tauri::command]
pub fn get_planner_document() -> AppResult<PlannerDocument> {
    store::read_document()
}

#[tauri::command]
pub fn save_planner_document(document: PlannerDocument) -> AppResult<PlannerDocument> {
    store::write_document(document)
}

#[tauri::command]
pub async fn get_planner_mcp_status(
    state: State<'_, PlannerState>,
) -> AppResult<PlannerMcpStatus> {
    Ok(state.mcp.status().await)
}

#[tauri::command]
pub async fn set_planner_mcp_enabled(
    state: State<'_, PlannerState>,
    enabled: bool,
) -> AppResult<PlannerMcpStatus> {
    state.mcp.set_enabled(enabled).await
}
