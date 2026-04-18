use crate::connectors::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub struct ClaudeCodeConnector;

impl ClaudeCodeConnector {
    pub fn new() -> Self { Self }

    fn default_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        if let Some(home) = dirs::home_dir() {
            // macOS
            roots.push(home.join(".claude"));
            // Linux
            roots.push(home.join(".config/claude"));
        }
        roots
    }

    fn parse_jsonl_file(&self, path: &Path) -> Option<NormalizedConversation> {
        let content = fs::read_to_string(path).ok()?;
        let mut messages = Vec::new();
        let mut workspace = None;
        let mut session_id = None;
        let mut git_branch = None;
        let mut model = None;

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() { continue; }

            let val: serde_json::Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue, // skip malformed lines
            };

            let event_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");

            match event_type {
                "user" => {
                    let content_str = extract_content(&val);
                    if content_str.is_empty() { continue; }
                    if workspace.is_none() {
                        workspace = val.get("cwd").and_then(|c| c.as_str()).map(|s| s.to_string());
                    }
                    if session_id.is_none() {
                        session_id = val.get("sessionId").and_then(|s| s.as_str()).map(|s| s.to_string());
                    }
                    messages.push(NormalizedMessage {
                        idx: 0,
                        role: "user".to_string(),
                        author: None,
                        created_at: val.get("timestamp").and_then(|t| t.as_str()).map(|s| s.to_string()),
                        content: content_str,
                        extra: serde_json::json!({}),
                    });
                }
                "assistant" => {
                    let content_str = extract_content(&val);
                    if content_str.is_empty() { continue; }
                    model = val.get("model").and_then(|m| m.as_str()).map(|s| s.to_string());
                    messages.push(NormalizedMessage {
                        idx: 0,
                        role: "assistant".to_string(),
                        author: model.clone(),
                        created_at: val.get("timestamp").and_then(|t| t.as_str()).map(|s| s.to_string()),
                        content: content_str,
                        extra: serde_json::json!({}),
                    });
                }
                "message" => {
                    if let Some(msg) = val.get("message") {
                        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("assistant");
                        let content_str = extract_content(msg);
                        if content_str.is_empty() { continue; }
                        if role == "assistant" {
                            model = msg.get("model").and_then(|m| m.as_str()).map(|s| s.to_string());
                        }
                        messages.push(NormalizedMessage {
                            idx: 0,
                            role: role.to_string(),
                            author: if role == "assistant" { model.clone() } else { None },
                            created_at: val.get("timestamp").and_then(|t| t.as_str()).map(|s| s.to_string()),
                            content: content_str,
                            extra: serde_json::json!({}),
                        });
                    }
                }
                _ => {
                    // Check if it has message content despite unknown type
                    if val.get("role").is_some() || val.get("content").is_some() {
                        let role = val.get("role").and_then(|r| r.as_str()).unwrap_or("system");
                        let content_str = extract_content(&val);
                        if !content_str.is_empty() {
                            messages.push(NormalizedMessage {
                                idx: 0,
                                role: role.to_string(),
                                author: None,
                                created_at: None,
                                content: content_str,
                                extra: serde_json::json!({}),
                            });
                        }
                    }
                    // else ignore non-message events like summary, file-history-snapshot
                }
            }

            if git_branch.is_none() {
                git_branch = val.get("gitBranch").and_then(|b| b.as_str()).map(|s| s.to_string());
            }
        }

        if messages.is_empty() { return None; }

        // Resequence indices
        for (i, msg) in messages.iter_mut().enumerate() {
            msg.idx = i;
        }

        // Derive title from first user message
        let title = messages.iter()
            .find(|m| m.role == "user")
            .map(|m| first_line(&m.content, 100))
            .or_else(|| {
                workspace.as_ref().map(|w| {
                    Path::new(w).file_name().unwrap_or_default().to_string_lossy().to_string()
                })
            });

        let started_at = messages.first().and_then(|m| m.created_at.clone());
        let ended_at = messages.last().and_then(|m| m.created_at.clone());
        let file_mtime = fs::metadata(path).ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        // External ID: project-relative path under projects/
        let external_id = path.to_string_lossy().to_string();

        let mut metadata = serde_json::json!({});
        if let Some(ref sid) = session_id {
            metadata["sessionId"] = serde_json::json!(sid);
        }
        if let Some(ref branch) = git_branch {
            metadata["gitBranch"] = serde_json::json!(branch);
        }

        Some(NormalizedConversation {
            agent_slug: "claude_code".to_string(),
            external_id,
            title,
            workspace,
            source_path: path.to_string_lossy().to_string(),
            started_at: started_at.or(file_mtime.clone()),
            ended_at: ended_at.or(file_mtime.clone()),
            metadata,
            messages,
            model,
            branch: git_branch,
            source_mtime: file_mtime,
        })
    }
}

impl Connector for ClaudeCodeConnector {
    fn name(&self) -> &str { "Claude Code" }
    fn agent_slug(&self) -> &str { "claude_code" }

    fn detect(&self) -> DetectionResult {
        for root in self.default_roots() {
            let projects_dir = root.join("projects");
            if projects_dir.is_dir() {
                return DetectionResult {
                    detected: true,
                    root_paths: vec![root.to_string_lossy().to_string()],
                    evidence: format!("Found projects directory at {}", projects_dir.display()),
                };
            }
        }
        DetectionResult {
            detected: false,
            root_paths: vec![],
            evidence: "No Claude Code session directories found".to_string(),
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
            let projects_dir = root.join("projects");
            if !projects_dir.is_dir() { continue; }

            for entry in WalkDir::new(&projects_dir).min_depth(1).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if !matches!(ext, "jsonl" | "json" | "claude") { continue; }
                if !path.is_file() { continue; }

                // File-level incremental filtering
                if let Some(since) = since_ts {
                    if let Ok(meta) = fs::metadata(path) {
                        if let Ok(mtime) = meta.modified() {
                            let mtime_str = chrono::DateTime::<chrono::Utc>::from(mtime).to_rfc3339();
                            if mtime_str.as_str() < since {
                                continue;
                            }
                        }
                    }
                }

                if let Some(conv) = self.parse_jsonl_file(path) {
                    conversations.push(conv);
                }
            }
        }

        conversations
    }
}

fn extract_content(val: &serde_json::Value) -> String {
    // Direct string content
    if let Some(s) = val.get("content").and_then(|c| c.as_str()) {
        return s.to_string();
    }
    // Array of content blocks
    if let Some(arr) = val.get("content").and_then(|c| c.as_array()) {
        let mut parts = Vec::new();
        for block in arr {
            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                parts.push(text.to_string());
            } else if let Some(block_type) = block.get("type").and_then(|t| t.as_str()) {
                match block_type {
                    "tool_use" => {
                        let name = block.get("name").and_then(|n| n.as_str()).unwrap_or("unknown");
                        let input = block.get("input").map(|i| i.to_string()).unwrap_or_default();
                        parts.push(format!("[tool: {}] {}", name, input));
                    }
                    "text" => {
                        if let Some(t) = block.get("text").and_then(|t| t.as_str()) {
                            parts.push(t.to_string());
                        }
                    }
                    _ => {}
                }
            }
        }
        return parts.join("\n");
    }
    // Message wrapper
    if let Some(msg) = val.get("message") {
        return extract_content(msg);
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
