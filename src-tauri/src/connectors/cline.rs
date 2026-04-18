use crate::connectors::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};
use std::fs;
use std::path::{Path, PathBuf};

pub struct ClineConnector;

impl ClineConnector {
    pub fn new() -> Self { Self }

    fn default_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        if let Some(home) = dirs::home_dir() {
            // macOS
            roots.push(home.join("Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev"));
            // Linux
            roots.push(home.join(".config/Code/User/globalStorage/saoudrizwan.claude-dev"));
            // Also check Cline-specific paths
            roots.push(home.join("Library/Application Support/Code/User/globalStorage/cline.cline"));
            roots.push(home.join(".config/Code/User/globalStorage/cline.cline"));
        }
        roots
    }

    fn parse_task_dir(&self, task_dir: &Path) -> Option<NormalizedConversation> {
        // Prefer ui_messages.json over api_conversation_history.json
        let ui_path = task_dir.join("ui_messages.json");
        let api_path = task_dir.join("api_conversation_history.json");
        let meta_path = task_dir.join("task_metadata.json");

        let messages_path = if ui_path.is_file() { &ui_path } else if api_path.is_file() { &api_path } else { return None; };

        let content = fs::read_to_string(messages_path).ok()?;
        let arr: Vec<serde_json::Value> = serde_json::from_str(&content).ok()?;

        let mut messages: Vec<NormalizedMessage> = Vec::new();

        for msg in &arr {
            let role = msg.get("role").and_then(|r| r.as_str())
                .or_else(|| msg.get("type").and_then(|t| t.as_str()))
                .unwrap_or("user");

            let content_str = msg.get("content").and_then(|c| c.as_str())
                .or_else(|| msg.get("text").and_then(|t| t.as_str()))
                .or_else(|| msg.get("message").and_then(|m| m.as_str()))
                .unwrap_or("").to_string();

            if content_str.is_empty() { continue; }

            let created_at = extract_timestamp(msg);

            messages.push(NormalizedMessage {
                idx: 0,
                role: normalize_role(role),
                author: None,
                created_at,
                content: content_str,
                extra: serde_json::json!({}),
            });
        }

        // Sort by timestamp
        messages.sort_by(|a, b| a.created_at.cmp(&b.created_at));

        if messages.is_empty() { return None; }

        for (i, msg) in messages.iter_mut().enumerate() {
            msg.idx = i;
        }

        // Read metadata
        let (title, workspace) = if let Ok(meta_content) = fs::read_to_string(&meta_path) {
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&meta_content) {
                let t = meta.get("title").and_then(|t| t.as_str()).map(|s| truncate(s, 100));
                let w = meta.get("rootPath").and_then(|r| r.as_str())
                    .or_else(|| meta.get("cwd").and_then(|c| c.as_str()))
                    .map(|s| s.to_string());
                (t, w)
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        let title = title.or_else(|| {
            messages.iter().find(|m| m.role == "user").map(|m| truncate(&first_line(&m.content), 100))
        });

        let task_name = task_dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let started_at = messages.first().and_then(|m| m.created_at.clone());
        let ended_at = messages.last().and_then(|m| m.created_at.clone());
        let file_mtime = fs::metadata(messages_path).ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        Some(NormalizedConversation {
            agent_slug: "cline".to_string(),
            external_id: task_name,
            title,
            workspace,
            source_path: task_dir.to_string_lossy().to_string(),
            started_at: started_at.or(file_mtime.clone()),
            ended_at: ended_at.or(file_mtime.clone()),
            metadata: serde_json::json!({"source": "cline"}),
            messages,
            model: None,
            branch: None,
            source_mtime: file_mtime,
        })
    }
}

impl Connector for ClineConnector {
    fn name(&self) -> &str { "Cline" }
    fn agent_slug(&self) -> &str { "cline" }

    fn detect(&self) -> DetectionResult {
        for root in self.default_roots() {
            if root.is_dir() {
                return DetectionResult {
                    detected: true,
                    root_paths: vec![root.to_string_lossy().to_string()],
                    evidence: format!("Found Cline storage at {}", root.display()),
                };
            }
        }
        DetectionResult {
            detected: false,
            root_paths: vec![],
            evidence: "No Cline storage found".to_string(),
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
            if !root.is_dir() { continue; }

            // Scan task directories
            let entries = match fs::read_dir(&root) {
                Ok(e) => e,
                Err(_) => continue,
            };

            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_dir() { continue; }

                // Ignore taskHistory directories
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name == "taskHistory" { continue; }

                if let Some(since) = since_ts {
                    // Use directory mtime for incremental filtering
                    if let Ok(meta) = fs::metadata(&path) {
                        if let Ok(mtime) = meta.modified() {
                            let mtime_str = chrono::DateTime::<chrono::Utc>::from(mtime).to_rfc3339();
                            if mtime_str.as_str() < since { continue; }
                        }
                    }
                }

                if let Some(conv) = self.parse_task_dir(&path) {
                    conversations.push(conv);
                }
            }
        }

        conversations
    }
}

fn normalize_role(role: &str) -> String {
    match role.to_lowercase().as_str() {
        "user" | "human" => "user".to_string(),
        "assistant" | "ai" | "bot" => "assistant".to_string(),
        "tool" | "function" => "tool".to_string(),
        "system" => "system".to_string(),
        other => other.to_string(),
    }
}

fn extract_timestamp(msg: &serde_json::Value) -> Option<String> {
    for key in &["timestamp", "created_at", "ts"] {
        if let Some(val) = msg.get(key) {
            if let Some(s) = val.as_str() {
                return Some(s.to_string());
            }
            if let Some(n) = val.as_i64() {
                // Could be seconds or milliseconds
                let ts = if n > 1_000_000_000_000 {
                    chrono::DateTime::from_timestamp(n / 1000, ((n % 1000) * 1_000_000) as u32)
                } else {
                    chrono::DateTime::from_timestamp(n, 0)
                };
                return ts.map(|t| t.to_rfc3339());
            }
            if let Some(n) = val.as_f64() {
                let secs = n as i64;
                let nsecs = ((n - secs as f64) * 1_000_000_000.0) as u32;
                return chrono::DateTime::from_timestamp(secs, nsecs).map(|t| t.to_rfc3339());
            }
        }
    }
    None
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or(s).to_string()
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        format!("{}…", &s[..max_len])
    } else {
        s.to_string()
    }
}
