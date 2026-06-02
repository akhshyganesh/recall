use crate::modules::sessions::connectors::Connector;
use crate::modules::sessions::models::{
    DetectionResult, NormalizedConversation, NormalizedMessage,
};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub struct PiConnector;

impl PiConnector {
    pub fn new() -> Self {
        Self
    }

    fn default_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        if let Some(home) = dirs::home_dir() {
            roots.push(home.join(".pi").join("agent"));
        }
        roots
    }

    fn parse_jsonl_file(&self, path: &Path) -> Option<NormalizedConversation> {
        let content = fs::read_to_string(path).ok()?;
        let mut messages: Vec<NormalizedMessage> = Vec::new();
        let mut session_id = None;
        let mut workspace = None;
        let mut model = None;
        let mut session_ts = None;

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let val: serde_json::Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            match val.get("type").and_then(|t| t.as_str()).unwrap_or("") {
                "session" => {
                    session_id = val.get("id").and_then(|v| v.as_str()).map(str::to_string);
                    workspace = val.get("cwd").and_then(|v| v.as_str()).map(str::to_string);
                    session_ts = val
                        .get("timestamp")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                }
                "model_change" if model.is_none() => {
                    model = val
                        .get("modelId")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                }
                "message" => {
                    let msg = val.get("message")?;
                    let role = msg
                        .get("role")
                        .and_then(|r| r.as_str())
                        .unwrap_or("user")
                        .to_string();

                    let text = extract_text_content(msg);
                    if text.is_empty() {
                        continue;
                    }

                    // author is model name for assistant messages
                    let author = if role == "assistant" {
                        msg.get("model")
                            .and_then(|v| v.as_str())
                            .map(str::to_string)
                            .or(model.clone())
                    } else {
                        None
                    };

                    let created_at = val
                        .get("timestamp")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);

                    messages.push(NormalizedMessage {
                        idx: 0,
                        role,
                        author,
                        created_at,
                        content: text,
                        extra: serde_json::json!({}),
                    });
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

        let external_id = session_id.clone().unwrap_or_else(|| {
            path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
        });

        let title = messages
            .iter()
            .find(|m| m.role == "user")
            .map(|m| first_line(&m.content, 100));

        let started_at = messages
            .first()
            .and_then(|m| m.created_at.clone())
            .or(session_ts);
        let ended_at = messages.last().and_then(|m| m.created_at.clone());

        let file_mtime = fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        Some(NormalizedConversation {
            agent_slug: "pi".to_string(),
            external_id,
            title,
            workspace,
            source_path: path.to_string_lossy().to_string(),
            started_at: started_at.or(file_mtime.clone()),
            ended_at: ended_at.or(file_mtime.clone()),
            metadata: serde_json::json!({}),
            messages,
            model,
            branch: None,
            source_mtime: file_mtime,
        })
    }
}

impl Connector for PiConnector {
    fn name(&self) -> &str {
        "Pi"
    }

    fn agent_slug(&self) -> &str {
        "pi"
    }

    fn detect(&self) -> DetectionResult {
        for root in self.default_roots() {
            let sessions_dir = root.join("sessions");
            if sessions_dir.is_dir() {
                return DetectionResult {
                    detected: true,
                    root_paths: vec![root.to_string_lossy().to_string()],
                    evidence: format!("Found Pi sessions at {}", sessions_dir.display()),
                };
            }
        }
        DetectionResult {
            detected: false,
            root_paths: vec![],
            evidence: "No Pi sessions directory found".to_string(),
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

                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if ext != "jsonl" {
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

                if let Some(conv) = self.parse_jsonl_file(path) {
                    conversations.push(conv);
                }
            }
        }

        conversations
    }
}

fn extract_text_content(msg: &serde_json::Value) -> String {
    let Some(content) = msg.get("content").and_then(|c| c.as_array()) else {
        return msg
            .get("content")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();
    };

    let mut parts = Vec::new();
    for block in content {
        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match block_type {
            "text" => {
                if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                    if !text.is_empty() {
                        parts.push(text.to_string());
                    }
                }
            }
            "toolCall" => {
                if let Some(name) = block.get("name").and_then(|n| n.as_str()) {
                    parts.push(format!("[Tool: {}]", name));
                }
            }
            _ => {}
        }
    }
    parts.join("\n")
}

fn first_line(s: &str, max_len: usize) -> String {
    let line = s.lines().next().unwrap_or(s);
    if line.len() > max_len {
        format!("{}…", &line[..max_len])
    } else {
        line.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::PiConnector;
    use crate::modules::sessions::connectors::Connector;
    use std::fs;
    use std::path::Path;

    fn write_fixture(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create fixture dir");
        }
        fs::write(path, content).expect("write fixture");
    }

    #[test]
    fn parses_pi_session_jsonl() {
        let tmp = std::env::temp_dir().join(format!("pi-test-{}", uuid::Uuid::new_v4()));
        let sessions_dir = tmp.join("sessions").join("--Users-akhshy-project--");
        let file = sessions_dir.join("2026-06-02T06-22-33-551Z_test-session.jsonl");

        write_fixture(
            &file,
            concat!(
                "{\"type\":\"session\",\"version\":3,\"id\":\"test-session-id\",\"timestamp\":\"2026-06-02T06:22:33.551Z\",\"cwd\":\"/Users/akhshy/project\"}\n",
                "{\"type\":\"model_change\",\"id\":\"abc\",\"parentId\":null,\"timestamp\":\"2026-06-02T06:22:33.643Z\",\"provider\":\"ollama\",\"modelId\":\"qwen3:27b\"}\n",
                "{\"type\":\"message\",\"id\":\"msg1\",\"timestamp\":\"2026-06-02T06:22:35.786Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hello pi\"}]}}\n",
                "{\"type\":\"message\",\"id\":\"msg2\",\"timestamp\":\"2026-06-02T06:22:51.905Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Hello! How can I help?\"}],\"model\":\"qwen3:27b\"}}\n",
            ),
        );

        let connector = PiConnector::new();
        let convs = connector.scan(&[tmp.to_string_lossy().to_string()], None);

        assert_eq!(convs.len(), 1);
        let conv = &convs[0];
        assert_eq!(conv.agent_slug, "pi");
        assert_eq!(conv.external_id, "test-session-id");
        assert_eq!(conv.workspace.as_deref(), Some("/Users/akhshy/project"));
        assert_eq!(conv.model.as_deref(), Some("qwen3:27b"));
        assert_eq!(conv.messages.len(), 2);
        assert_eq!(conv.messages[0].role, "user");
        assert_eq!(conv.messages[0].content, "hello pi");
        assert_eq!(conv.messages[1].role, "assistant");
        assert_eq!(conv.title.as_deref(), Some("hello pi"));

        let _ = fs::remove_dir_all(&tmp);
    }
}
