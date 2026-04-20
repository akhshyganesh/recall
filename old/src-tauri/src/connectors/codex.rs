use crate::connectors::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub struct CodexConnector;

impl CodexConnector {
    pub fn new() -> Self {
        Self
    }

    fn default_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        if let Some(home) = dirs::home_dir() {
            // CODEX_HOME default
            if let Ok(codex_home) = std::env::var("CODEX_HOME") {
                roots.push(PathBuf::from(codex_home));
            }
            roots.push(home.join(".codex"));
            roots.push(home.join(".config/codex"));
        }
        roots
    }

    fn parse_jsonl_file(&self, path: &Path) -> Option<NormalizedConversation> {
        let content = fs::read_to_string(path).ok()?;
        let mut messages: Vec<NormalizedMessage> = Vec::new();
        let mut workspace = None;
        let model = None;
        let mut session_meta = serde_json::json!({});

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let val: serde_json::Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let event_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");

            match event_type {
                "session_meta" => {
                    workspace = val
                        .get("cwd")
                        .and_then(|c| c.as_str())
                        .map(|s| s.to_string());
                    session_meta = val.clone();
                }
                "response_item" => {
                    if let Some(payload) = val.get("payload") {
                        let payload_type =
                            payload.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if payload_type == "message" {
                            let role = payload
                                .get("role")
                                .and_then(|r| r.as_str())
                                .unwrap_or("assistant");
                            let content_str = extract_content_blocks(payload);
                            if content_str.is_empty() {
                                continue;
                            }
                            messages.push(NormalizedMessage {
                                idx: 0,
                                role: role.to_string(),
                                author: model.clone(),
                                created_at: val
                                    .get("timestamp")
                                    .and_then(|t| t.as_str())
                                    .map(|s| s.to_string()),
                                content: content_str,
                                extra: serde_json::json!({}),
                            });
                        }
                    }
                }
                "event_msg" => {
                    let variant = val.get("variant").and_then(|v| v.as_str()).unwrap_or("");
                    match variant {
                        "user_message" => {
                            let content_str = val
                                .get("content")
                                .and_then(|c| c.as_str())
                                .or_else(|| {
                                    val.get("data")
                                        .and_then(|d| d.get("content"))
                                        .and_then(|c| c.as_str())
                                })
                                .unwrap_or("")
                                .to_string();
                            if !content_str.is_empty() {
                                messages.push(NormalizedMessage {
                                    idx: 0,
                                    role: "user".to_string(),
                                    author: None,
                                    created_at: val
                                        .get("timestamp")
                                        .and_then(|t| t.as_str())
                                        .map(|s| s.to_string()),
                                    content: content_str,
                                    extra: serde_json::json!({}),
                                });
                            }
                        }
                        "agent_reasoning" => {
                            let content_str = val
                                .get("content")
                                .and_then(|c| c.as_str())
                                .or_else(|| {
                                    val.get("data")
                                        .and_then(|d| d.get("content"))
                                        .and_then(|c| c.as_str())
                                })
                                .unwrap_or("")
                                .to_string();
                            if !content_str.is_empty() {
                                messages.push(NormalizedMessage {
                                    idx: 0,
                                    role: "assistant".to_string(),
                                    author: Some("reasoning".to_string()),
                                    created_at: val
                                        .get("timestamp")
                                        .and_then(|t| t.as_str())
                                        .map(|s| s.to_string()),
                                    content: format!("[Reasoning] {}", content_str),
                                    extra: serde_json::json!({}),
                                });
                            }
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        }

        if messages.is_empty() {
            return None;
        }

        for (i, msg) in messages.iter_mut().enumerate() {
            msg.idx = i;
        }

        let title = messages
            .iter()
            .find(|m| m.role == "user")
            .map(|m| first_line(&m.content, 100));

        // external_id: relative path from sessions dir without extension
        let external_id = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string());

        let started_at = messages.first().and_then(|m| m.created_at.clone());
        let ended_at = messages.last().and_then(|m| m.created_at.clone());
        let file_mtime = fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        Some(NormalizedConversation {
            agent_slug: "codex".to_string(),
            external_id,
            title,
            workspace,
            source_path: path.to_string_lossy().to_string(),
            started_at: started_at.or(file_mtime.clone()),
            ended_at: ended_at.or(file_mtime.clone()),
            metadata: session_meta,
            messages,
            model,
            branch: None,
            source_mtime: file_mtime,
        })
    }

    fn parse_json_file(&self, path: &Path) -> Option<NormalizedConversation> {
        let content = fs::read_to_string(path).ok()?;
        let val: serde_json::Value = serde_json::from_str(&content).ok()?;

        let items = val.get("items").and_then(|i| i.as_array())?;
        let mut messages: Vec<NormalizedMessage> = Vec::new();

        for item in items {
            let role = item
                .get("role")
                .and_then(|r| r.as_str())
                .unwrap_or("assistant");
            let content_str = extract_content_blocks(item);
            if content_str.is_empty() {
                continue;
            }
            messages.push(NormalizedMessage {
                idx: 0,
                role: role.to_string(),
                author: None,
                created_at: item
                    .get("created_at")
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string()),
                content: content_str,
                extra: serde_json::json!({}),
            });
        }

        if messages.is_empty() {
            return None;
        }

        for (i, msg) in messages.iter_mut().enumerate() {
            msg.idx = i;
        }

        let workspace = val
            .get("session")
            .and_then(|s| s.get("cwd"))
            .and_then(|c| c.as_str())
            .map(|s| s.to_string());
        let title = messages
            .iter()
            .find(|m| m.role == "user")
            .map(|m| first_line(&m.content, 100));
        let file_mtime = fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        Some(NormalizedConversation {
            agent_slug: "codex".to_string(),
            external_id: path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default(),
            title,
            workspace,
            source_path: path.to_string_lossy().to_string(),
            started_at: file_mtime.clone(),
            ended_at: file_mtime.clone(),
            metadata: serde_json::json!({"source": "rollout_json"}),
            messages,
            model: None,
            branch: None,
            source_mtime: file_mtime,
        })
    }
}

impl Connector for CodexConnector {
    fn name(&self) -> &str {
        "Codex CLI"
    }
    fn agent_slug(&self) -> &str {
        "codex"
    }

    fn detect(&self) -> DetectionResult {
        for root in self.default_roots() {
            let sessions_dir = root.join("sessions");
            if sessions_dir.is_dir() {
                return DetectionResult {
                    detected: true,
                    root_paths: vec![root.to_string_lossy().to_string()],
                    evidence: format!("Found Codex sessions at {}", sessions_dir.display()),
                };
            }
        }
        DetectionResult {
            detected: false,
            root_paths: vec![],
            evidence: "No Codex sessions directory found".to_string(),
        }
    }

    fn scan(&self, roots: &[String], since_ts: Option<&str>) -> Vec<NormalizedConversation> {
        let scan_roots: Vec<PathBuf> = if roots.is_empty() {
            self.default_roots()
        } else {
            roots.iter().map(PathBuf::from).collect()
        };

        let mut conversations = Vec::new();

        for root in scan_roots {
            let sessions_dir = root.join("sessions");
            if !sessions_dir.is_dir() {
                continue;
            }

            for entry in WalkDir::new(&sessions_dir)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if !fname.starts_with("rollout-") {
                    continue;
                }

                if let Some(since) = since_ts {
                    if let Ok(meta) = fs::metadata(path) {
                        if let Ok(mtime) = meta.modified() {
                            let mtime_str =
                                chrono::DateTime::<chrono::Utc>::from(mtime).to_rfc3339();
                            if mtime_str.as_str() < since {
                                continue;
                            }
                        }
                    }
                }

                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                match ext {
                    "jsonl" => {
                        if let Some(conv) = self.parse_jsonl_file(path) {
                            conversations.push(conv);
                        }
                    }
                    "json" => {
                        if let Some(conv) = self.parse_json_file(path) {
                            conversations.push(conv);
                        }
                    }
                    _ => {}
                }
            }
        }

        conversations
    }
}

fn extract_content_blocks(val: &serde_json::Value) -> String {
    if let Some(s) = val.get("content").and_then(|c| c.as_str()) {
        return s.to_string();
    }
    if let Some(arr) = val.get("content").and_then(|c| c.as_array()) {
        let mut parts = Vec::new();
        for block in arr {
            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                parts.push(text.to_string());
            } else if let Some(input_text) = block.get("input_text").and_then(|t| t.as_str()) {
                parts.push(input_text.to_string());
            }
        }
        return parts.join("\n");
    }
    String::new()
}

fn first_line(s: &str, max_len: usize) -> String {
    let line = s.lines().next().unwrap_or(s);
    if line.len() > max_len {
        format!("{}…", &line[..max_len])
    } else {
        line.to_string()
    }
}
