use crate::connectors::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub struct CursorConnector;

impl CursorConnector {
    pub fn new() -> Self { Self }

    fn default_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        if let Some(home) = dirs::home_dir() {
            // macOS
            roots.push(home.join("Library/Application Support/Cursor/User/globalStorage"));
            roots.push(home.join("Library/Application Support/Cursor/User/workspaceStorage"));
            // Linux
            roots.push(home.join(".config/Cursor/User/globalStorage"));
            roots.push(home.join(".config/Cursor/User/workspaceStorage"));
        }
        roots
    }

    fn parse_vscdb(&self, path: &Path) -> Vec<NormalizedConversation> {
        // Open the SQLite database
        let conn = match rusqlite::Connection::open_with_flags(
            path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        ) {
            Ok(c) => c,
            Err(_) => return vec![],
        };

        let mut conversations = Vec::new();

        // Try cursorDiskKV table for composerData
        if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'") {
            if let Ok(rows) = stmt.query_map([], |row| {
                let key: String = row.get(0)?;
                let value: String = row.get(1)?;
                Ok((key, value))
            }) {
                for row in rows.flatten() {
                    let (key, value) = row;
                    if let Some(conv) = self.parse_composer_data(&key, &value, path) {
                        conversations.push(conv);
                    }
                }
            }
        }

        // Try ItemTable for legacy chatdata
        if conversations.is_empty() {
            if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%chatdata%'") {
                if let Ok(rows) = stmt.query_map([], |row| {
                    let key: String = row.get(0)?;
                    let value: String = row.get(1)?;
                    Ok((key, value))
                }) {
                    for row in rows.flatten() {
                        let (key, value) = row;
                        if let Some(conv) = self.parse_legacy_chatdata(&key, &value, path) {
                            conversations.push(conv);
                        }
                    }
                }
            }
        }

        conversations
    }

    fn parse_composer_data(&self, key: &str, value: &str, path: &Path) -> Option<NormalizedConversation> {
        let val: serde_json::Value = serde_json::from_str(value).ok()?;
        let mut messages = Vec::new();
        let mut model = None;

        let tabs = val.get("tabs").and_then(|t| t.as_array())?;
        for tab in tabs {
            let bubbles = tab.get("bubbles").and_then(|b| b.as_array());
            if let Some(bubbles) = bubbles {
                for bubble in bubbles {
                    let text = bubble.get("text").and_then(|t| t.as_str()).unwrap_or("");
                    if text.is_empty() { continue; }

                    let bubble_type = bubble.get("type");
                    let role = match bubble_type {
                        Some(serde_json::Value::String(s)) => match s.as_str() {
                            "user" | "human" => "user",
                            "ai" | "assistant" => "assistant",
                            _ => "assistant",
                        },
                        Some(serde_json::Value::Number(n)) => {
                            if n.as_i64() == Some(1) { "user" } else { "assistant" }
                        }
                        _ => "assistant",
                    };

                    if role == "assistant" {
                        if model.is_none() {
                            model = bubble.get("model").and_then(|m| m.as_str()).map(|s| s.to_string())
                                .or_else(|| bubble.get("modelType").and_then(|m| m.as_str()).map(|s| s.to_string()));
                        }
                    }

                    messages.push(NormalizedMessage {
                        idx: 0,
                        role: role.to_string(),
                        author: if role == "assistant" { model.clone() } else { None },
                        created_at: None,
                        content: text.to_string(),
                        extra: serde_json::json!({}),
                    });
                }
            }
        }

        if messages.is_empty() { return None; }

        for (i, msg) in messages.iter_mut().enumerate() {
            msg.idx = i;
        }

        let id = key.strip_prefix("composerData:").unwrap_or(key);
        let title = val.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())
            .or_else(|| messages.iter().find(|m| m.role == "user").map(|m| first_line(&m.content, 100)));
        let file_mtime = fs::metadata(path).ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        Some(NormalizedConversation {
            agent_slug: "cursor".to_string(),
            external_id: id.to_string(),
            title,
            workspace: None,
            source_path: path.to_string_lossy().to_string(),
            started_at: file_mtime.clone(),
            ended_at: file_mtime.clone(),
            metadata: serde_json::json!({}),
            messages,
            model,
            branch: None,
            source_mtime: file_mtime,
        })
    }

    fn parse_legacy_chatdata(&self, key: &str, value: &str, path: &Path) -> Option<NormalizedConversation> {
        let val: serde_json::Value = serde_json::from_str(value).ok()?;
        let msgs = val.as_array().or_else(|| val.get("messages").and_then(|m| m.as_array()))?;

        let mut messages = Vec::new();
        for msg in msgs {
            let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
            let content = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
            if content.is_empty() { continue; }
            messages.push(NormalizedMessage {
                idx: 0,
                role: role.to_string(),
                author: None,
                created_at: None,
                content: content.to_string(),
                extra: serde_json::json!({}),
            });
        }

        if messages.is_empty() { return None; }

        for (i, msg) in messages.iter_mut().enumerate() {
            msg.idx = i;
        }

        let file_mtime = fs::metadata(path).ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        Some(NormalizedConversation {
            agent_slug: "cursor".to_string(),
            external_id: key.to_string(),
            title: messages.iter().find(|m| m.role == "user").map(|m| first_line(&m.content, 100)),
            workspace: None,
            source_path: path.to_string_lossy().to_string(),
            started_at: file_mtime.clone(),
            ended_at: file_mtime.clone(),
            metadata: serde_json::json!({}),
            messages,
            model: None,
            branch: None,
            source_mtime: file_mtime,
        })
    }
}

impl Connector for CursorConnector {
    fn name(&self) -> &str { "Cursor" }
    fn agent_slug(&self) -> &str { "cursor" }

    fn detect(&self) -> DetectionResult {
        for root in self.default_roots() {
            if root.is_dir() {
                // Check for state.vscdb files
                for entry in WalkDir::new(&root).max_depth(2).into_iter().filter_map(|e| e.ok()) {
                    if entry.file_name().to_str() == Some("state.vscdb") {
                        return DetectionResult {
                            detected: true,
                            root_paths: vec![root.to_string_lossy().to_string()],
                            evidence: format!("Found Cursor state.vscdb at {}", entry.path().display()),
                        };
                    }
                }
            }
        }
        DetectionResult {
            detected: false,
            root_paths: vec![],
            evidence: "No Cursor storage found".to_string(),
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
            for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
                if entry.file_name().to_str() != Some("state.vscdb") { continue; }
                let path = entry.path();

                if let Some(since) = since_ts {
                    if let Ok(meta) = fs::metadata(path) {
                        if let Ok(mtime) = meta.modified() {
                            let mtime_str = chrono::DateTime::<chrono::Utc>::from(mtime).to_rfc3339();
                            if mtime_str.as_str() < since { continue; }
                        }
                    }
                }

                conversations.extend(self.parse_vscdb(path));
            }
        }

        conversations
    }
}

fn first_line(s: &str, max_len: usize) -> String {
    let line = s.lines().next().unwrap_or(s);
    if line.len() > max_len {
        format!("{}…", &line[..max_len])
    } else {
        line.to_string()
    }
}
