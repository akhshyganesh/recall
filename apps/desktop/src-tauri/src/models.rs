//! Wire-format domain types shared with the TypeScript frontend.
//!
//! Every struct that crosses the Tauri IPC boundary is annotated with
//! `#[derive(TS)]` so the matching TypeScript declarations can be
//! regenerated into `packages/shared-types/src/generated/` via:
//!
//! ```sh
//! pnpm types:generate
//! ```
//!
//! The `NormalizedConversation` / `NormalizedMessage` pair is an
//! in-process intermediate used by connectors — it does not cross the
//! IPC boundary and therefore is not exported.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct Session {
    pub id: String,
    pub tool: String,
    pub agent_slug: String,
    pub source_path: Option<String>,
    pub repo_name: Option<String>,
    pub repo_path: Option<String>,
    pub branch: Option<String>,
    pub title: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub model: Option<String>,
    #[ts(type = "number")]
    pub message_count: i64,
    #[ts(type = "number")]
    pub file_count: i64,
    pub workspace: Option<String>,
    pub external_id: Option<String>,
    pub metadata: String,
    pub indexed_at: String,
    pub source_mtime: Option<String>,
    pub messages: Vec<Message>,
    pub file_changes: Vec<FileChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct Message {
    pub id: String,
    pub session_id: String,
    #[ts(type = "number")]
    pub idx: i64,
    pub role: String,
    pub author: Option<String>,
    pub content: String,
    pub created_at: Option<String>,
    pub extra: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct FileChange {
    pub id: String,
    pub session_id: String,
    pub path: String,
    #[ts(type = "number")]
    pub additions: i64,
    #[ts(type = "number")]
    pub deletions: i64,
    pub diff_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct SessionSummary {
    pub id: String,
    pub tool: String,
    pub agent_slug: String,
    pub title: Option<String>,
    pub repo_name: Option<String>,
    pub repo_path: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    #[ts(type = "number")]
    pub message_count: i64,
    #[ts(type = "number")]
    pub file_count: i64,
    pub model: Option<String>,
    pub workspace: Option<String>,
    pub is_favorite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct SearchResult {
    pub id: String,
    pub tool: String,
    pub agent_slug: String,
    pub title: Option<String>,
    pub repo_name: Option<String>,
    pub repo_path: Option<String>,
    pub started_at: Option<String>,
    #[ts(type = "number")]
    pub message_count: i64,
    pub model: Option<String>,
    pub workspace: Option<String>,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct ActivityPoint {
    pub date: String,
    pub tool: String,
    #[ts(type = "number")]
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct DetectionResult {
    pub detected: bool,
    pub root_paths: Vec<String>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct ExportData {
    pub format: String,
    pub content: String,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../packages/shared-types/src/generated/")]
pub struct Stats {
    #[ts(type = "number")]
    pub total_sessions: i64,
    #[ts(type = "number")]
    pub total_messages: i64,
    #[ts(type = "number")]
    pub total_tools: i64,
}

// ---------------------------------------------------------------------------
// Internal (not exported): intermediate values produced by connectors and
// consumed by the indexer before being persisted.
// ---------------------------------------------------------------------------

/// Normalized conversation produced by connectors
#[derive(Debug, Clone)]
pub struct NormalizedConversation {
    pub agent_slug: String,
    pub external_id: String,
    pub title: Option<String>,
    pub workspace: Option<String>,
    pub source_path: String,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub metadata: serde_json::Value,
    pub messages: Vec<NormalizedMessage>,
    pub model: Option<String>,
    pub branch: Option<String>,
    pub source_mtime: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NormalizedMessage {
    pub idx: usize,
    pub role: String,
    pub author: Option<String>,
    pub created_at: Option<String>,
    pub content: String,
    pub extra: serde_json::Value,
}
