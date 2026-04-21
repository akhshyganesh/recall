use crate::connectors::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub struct GeminiConnector;

impl GeminiConnector {
    pub fn new() -> Self {
        Self
    }

    fn default_roots(&self) -> Vec<PathBuf> {
        // Gemini CLI stores sessions under the user's home directory on every
        // supported OS:
        // - macOS / Linux / Windows: ~/.gemini
        // - Linux XDG fallback:     ~/.config/gemini
        let mut roots = Vec::new();
        if let Some(home) = dirs::home_dir() {
            roots.push(home.join(".gemini"));
            if !cfg!(target_os = "windows") {
                roots.push(home.join(".config/gemini"));
            }
        }
        roots
    }

    fn parse_session_file(&self, path: &Path) -> Option<NormalizedConversation> {
        let content = fs::read_to_string(path).ok()?;
        let val: serde_json::Value = serde_json::from_str(&content).ok()?;

        let session_id = val.get("sessionId").and_then(|s| s.as_str())?.to_string();
        let project_hash = val
            .get("projectHash")
            .and_then(|p| p.as_str())
            .map(|s| s.to_string());
        let msgs = val.get("messages").and_then(|m| m.as_array())?;

        let mut messages: Vec<NormalizedMessage> = Vec::new();
        let mut workspace = None;

        for msg in msgs {
            let msg_type = msg
                .get("type")
                .and_then(|t| t.as_str())
                .or_else(|| msg.get("role").and_then(|r| r.as_str()))
                .unwrap_or("user");

            let role = match msg_type {
                "model" | "assistant" => "assistant",
                "user" | "human" => "user",
                other => other,
            };

            let content_str = msg
                .get("content")
                .and_then(|c| c.as_str())
                .or_else(|| msg.get("text").and_then(|t| t.as_str()))
                .unwrap_or("")
                .to_string();

            if content_str.is_empty() {
                continue;
            }

            // Extract workspace from message content patterns
            if workspace.is_none() {
                if let Some(cap) = extract_workspace_from_content(&content_str) {
                    workspace = Some(cap);
                }
            }

            let created_at = msg
                .get("timestamp")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
                .or_else(|| {
                    msg.get("created_at")
                        .and_then(|t| t.as_str())
                        .map(|s| s.to_string())
                });

            messages.push(NormalizedMessage {
                idx: 0,
                role: role.to_string(),
                author: None,
                created_at,
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

        let title = messages
            .iter()
            .find(|m| m.role == "user")
            .map(|m| first_line(&m.content, 100));

        let started_at = val
            .get("startTime")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string())
            .or_else(|| messages.first().and_then(|m| m.created_at.clone()));
        let ended_at = val
            .get("lastUpdated")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string())
            .or_else(|| messages.last().and_then(|m| m.created_at.clone()));
        let file_mtime = fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        let mut metadata = serde_json::json!({});
        if let Some(ref ph) = project_hash {
            metadata["project_hash"] = serde_json::json!(ph);
        }

        Some(NormalizedConversation {
            agent_slug: "gemini".to_string(),
            external_id: session_id,
            title,
            workspace,
            source_path: path.to_string_lossy().to_string(),
            started_at: started_at.or(file_mtime.clone()),
            ended_at: ended_at.or(file_mtime.clone()),
            metadata,
            messages,
            model: None,
            branch: None,
            source_mtime: file_mtime,
        })
    }
}

impl Connector for GeminiConnector {
    fn name(&self) -> &str {
        "Gemini CLI"
    }
    fn agent_slug(&self) -> &str {
        "gemini"
    }

    fn detect(&self) -> DetectionResult {
        for root in self.default_roots() {
            if root.is_dir() {
                // Look for chats subdirectory or any projectHash dirs
                let chats_dir = root.join("chats");
                if chats_dir.is_dir() {
                    return DetectionResult {
                        detected: true,
                        root_paths: vec![root.to_string_lossy().to_string()],
                        evidence: format!("Found Gemini chats at {}", chats_dir.display()),
                    };
                }
                // Check for <projectHash>/chats/ pattern
                if let Ok(entries) = fs::read_dir(&root) {
                    for entry in entries.filter_map(|e| e.ok()) {
                        let p = entry.path();
                        if p.is_dir() && p.join("chats").is_dir() {
                            return DetectionResult {
                                detected: true,
                                root_paths: vec![root.to_string_lossy().to_string()],
                                evidence: format!("Found Gemini project chats at {}", p.display()),
                            };
                        }
                    }
                }
            }
        }
        DetectionResult {
            detected: false,
            root_paths: vec![],
            evidence: "No Gemini CLI sessions found".to_string(),
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
            if !root.is_dir() {
                continue;
            }

            for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                if !path.is_file() {
                    continue;
                }

                // Only scan files under chats/ directories
                let parent_name = path
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    .unwrap_or("");
                if parent_name != "chats" {
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

                if let Some(conv) = self.parse_session_file(path) {
                    conversations.push(conv);
                }
            }
        }

        conversations
    }
}

fn extract_workspace_from_content(content: &str) -> Option<String> {
    // Pattern: "# AGENTS.md instructions for /path/to/project"
    if let Some(pos) = content.find("instructions for ") {
        let rest = &content[pos + 17..];
        let path = rest.lines().next().unwrap_or("").trim();
        if path.starts_with('/') {
            return Some(path.to_string());
        }
    }
    // Pattern: "Working directory: /path/to/project"
    if let Some(pos) = content.find("Working directory: ") {
        let rest = &content[pos + 19..];
        let path = rest.lines().next().unwrap_or("").trim();
        if path.starts_with('/') {
            return Some(path.to_string());
        }
    }
    None
}

fn first_line(s: &str, max_len: usize) -> String {
    let line = s.lines().next().unwrap_or(s);
    if line.len() > max_len {
        format!("{}…", &line[..max_len])
    } else {
        line.to_string()
    }
}
