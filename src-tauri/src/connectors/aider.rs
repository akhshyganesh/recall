use crate::connectors::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub struct AiderConnector;

impl AiderConnector {
    pub fn new() -> Self { Self }

    fn parse_history_file(&self, path: &Path) -> Option<NormalizedConversation> {
        let content = fs::read_to_string(path).ok()?;
        let mut messages: Vec<NormalizedMessage> = Vec::new();
        let mut current_role = "system";
        let mut current_lines: Vec<String> = Vec::new();

        for line in content.lines() {
            if line.starts_with("> ") {
                // User input line
                if current_role != "user" && !current_lines.is_empty() {
                    let text = current_lines.join("\n").trim().to_string();
                    if !text.is_empty() {
                        messages.push(NormalizedMessage {
                            idx: 0,
                            role: current_role.to_string(),
                            author: None,
                            created_at: None,
                            content: text,
                            extra: serde_json::json!({}),
                        });
                    }
                    current_lines.clear();
                }
                current_role = "user";
                current_lines.push(line[2..].to_string());
            } else {
                if current_role == "user" && !current_lines.is_empty() {
                    let text = current_lines.join("\n").trim().to_string();
                    if !text.is_empty() {
                        messages.push(NormalizedMessage {
                            idx: 0,
                            role: "user".to_string(),
                            author: None,
                            created_at: None,
                            content: text,
                            extra: serde_json::json!({}),
                        });
                    }
                    current_lines.clear();
                }
                if current_role == "user" {
                    current_role = "assistant";
                }
                current_lines.push(line.to_string());
            }
        }

        // Flush remaining
        if !current_lines.is_empty() {
            let text = current_lines.join("\n").trim().to_string();
            if !text.is_empty() {
                messages.push(NormalizedMessage {
                    idx: 0,
                    role: current_role.to_string(),
                    author: None,
                    created_at: None,
                    content: text,
                    extra: serde_json::json!({}),
                });
            }
        }

        if messages.is_empty() { return None; }

        for (i, msg) in messages.iter_mut().enumerate() {
            msg.idx = i;
        }

        let workspace = path.parent().map(|p| p.to_string_lossy().to_string());
        let dir_name = path.parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let title = format!("Aider Chat: {}", dir_name);
        let file_mtime = fs::metadata(path).ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        Some(NormalizedConversation {
            agent_slug: "aider".to_string(),
            external_id: path.to_string_lossy().to_string(),
            title: Some(title),
            workspace,
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

impl Connector for AiderConnector {
    fn name(&self) -> &str { "Aider" }
    fn agent_slug(&self) -> &str { "aider" }

    fn detect(&self) -> DetectionResult {
        if let Some(home) = dirs::home_dir() {
            // Check common project directories for .aider.chat.history.md
            let check_dirs = vec![
                home.clone(),
                home.join("projects"),
                home.join("code"),
                home.join("dev"),
                home.join("src"),
                home.join("workspace"),
            ];
            for dir in check_dirs {
                let marker = dir.join(".aider.chat.history.md");
                if marker.is_file() {
                    return DetectionResult {
                        detected: true,
                        root_paths: vec![dir.to_string_lossy().to_string()],
                        evidence: format!("Found aider history at {}", marker.display()),
                    };
                }
            }
        }
        DetectionResult {
            detected: false,
            root_paths: vec![],
            evidence: "No aider chat history files found".to_string(),
        }
    }

    fn scan(&self, roots: &[String], since_ts: Option<&str>) -> Vec<NormalizedConversation> {
        let scan_roots: Vec<PathBuf> = if roots.is_empty() {
            if let Some(home) = dirs::home_dir() {
                vec![home]
            } else {
                return vec![];
            }
        } else {
            roots.iter().map(PathBuf::from).collect()
        };

        let mut conversations = Vec::new();

        for root in scan_roots {
            for entry in WalkDir::new(&root)
                .into_iter()
                .filter_entry(|e| {
                    let name = e.file_name().to_str().unwrap_or("");
                    // Skip hidden dirs except .aider files, and skip node_modules etc.
                    if e.file_type().is_dir() {
                        !matches!(name, "node_modules" | ".git" | "target" | "build" | "dist" | "__pycache__" | ".venv" | "venv")
                    } else {
                        true
                    }
                })
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if path.file_name().and_then(|n| n.to_str()) != Some(".aider.chat.history.md") { continue; }

                if let Some(since) = since_ts {
                    if let Ok(meta) = fs::metadata(path) {
                        if let Ok(mtime) = meta.modified() {
                            let mtime_str = chrono::DateTime::<chrono::Utc>::from(mtime).to_rfc3339();
                            if mtime_str.as_str() < since { continue; }
                        }
                    }
                }

                if let Some(conv) = self.parse_history_file(path) {
                    conversations.push(conv);
                }
            }
        }

        conversations
    }
}
