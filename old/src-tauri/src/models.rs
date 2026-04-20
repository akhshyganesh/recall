use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub message_count: i64,
    pub file_count: i64,
    pub workspace: Option<String>,
    pub external_id: Option<String>,
    pub metadata: String,
    pub indexed_at: String,
    pub source_mtime: Option<String>,
    pub messages: Vec<Message>,
    pub file_changes: Vec<FileChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub idx: i64,
    pub role: String,
    pub author: Option<String>,
    pub content: String,
    pub created_at: Option<String>,
    pub extra: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub id: String,
    pub session_id: String,
    pub path: String,
    pub additions: i64,
    pub deletions: i64,
    pub diff_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub tool: String,
    pub agent_slug: String,
    pub title: Option<String>,
    pub repo_name: Option<String>,
    pub repo_path: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub message_count: i64,
    pub file_count: i64,
    pub model: Option<String>,
    pub workspace: Option<String>,
    pub is_favorite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub tool: String,
    pub agent_slug: String,
    pub title: Option<String>,
    pub repo_name: Option<String>,
    pub repo_path: Option<String>,
    pub started_at: Option<String>,
    pub message_count: i64,
    pub model: Option<String>,
    pub workspace: Option<String>,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityPoint {
    pub date: String,
    pub tool: String,
    pub session_count: i64,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionResult {
    pub detected: bool,
    pub root_paths: Vec<String>,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportData {
    pub format: String,
    pub content: String,
    pub filename: String,
}
