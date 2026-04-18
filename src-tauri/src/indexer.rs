use crate::connectors;
use crate::models::{
    DetectionResult, FileChange, Message, NormalizedConversation, NormalizedMessage, Session,
};
use chrono::Utc;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::mpsc;

pub struct Indexer;

impl Indexer {
    pub fn detect_all() -> Vec<(String, String, DetectionResult)> {
        let connectors = connectors::all_connectors();
        connectors
            .iter()
            .map(|c| {
                let result = c.detect();
                (c.name().to_string(), c.agent_slug().to_string(), result)
            })
            .collect()
    }

    /// Collect all sessions from connectors without touching the DB.
    /// Sends sessions one at a time through a channel to keep memory bounded.
    /// Returns a receiver that yields Session values as they are parsed.
    pub fn collect_sessions(since_ts: Option<&str>) -> mpsc::Receiver<Session> {
        let since_owned = since_ts.map(|s| s.to_string());
        let (tx, rx) = mpsc::channel();

        std::thread::spawn(move || {
            let connectors = connectors::all_connectors();
            for connector in &connectors {
                let detection = connector.detect();
                if !detection.detected {
                    continue;
                }

                let conversations = connector.scan(&detection.root_paths, since_owned.as_deref());
                for conv in conversations {
                    if tx.send(normalize_to_session(conv)).is_err() {
                        return; // receiver dropped, stop work
                    }
                }
            }
        });

        rx
    }
}

fn deterministic_id(agent_slug: &str, external_id: &str) -> String {
    format!(
        "{}-{:016x}",
        agent_slug,
        stable_hash(&(agent_slug, external_id))
    )
}

fn stable_hash<T: Hash>(value: &T) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn diff_stats(diff_text: &str) -> (i64, i64) {
    let mut additions = 0i64;
    let mut deletions = 0i64;

    for line in diff_text.lines() {
        if line.starts_with("+++ ") || line.starts_with("--- ") {
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
        } else if line.starts_with('-') {
            deletions += 1;
        }
    }

    (additions, deletions)
}

fn extract_file_changes(messages: &[NormalizedMessage], session_id: &str) -> Vec<FileChange> {
    let mut file_changes: Vec<FileChange> = Vec::new();
    let mut file_indices = HashMap::<String, usize>::new();

    for message in messages {
        let Some(parts) = message
            .extra
            .get("parts")
            .and_then(|value| value.as_array())
        else {
            continue;
        };

        for part in parts {
            if part.get("type").and_then(|value| value.as_str()) != Some("text_edit") {
                continue;
            }

            let Some(path) = part.get("file_path").and_then(|value| value.as_str()) else {
                continue;
            };
            let path = path.trim();
            if path.is_empty() {
                continue;
            }

            let diff_text = part
                .get("diff")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);

            let (additions, deletions) = diff_text.as_deref().map(diff_stats).unwrap_or((0, 0));

            if let Some(existing_index) = file_indices.get(path).copied() {
                let existing = &mut file_changes[existing_index];
                if let Some(diff_text) = diff_text {
                    existing.additions = additions;
                    existing.deletions = deletions;
                    existing.diff_text = Some(diff_text);
                }
                continue;
            }

            let path_owned = path.to_string();
            file_indices.insert(path_owned.clone(), file_changes.len());
            file_changes.push(FileChange {
                id: format!("{}-file-{:016x}", session_id, stable_hash(&path_owned)),
                session_id: session_id.to_string(),
                path: path_owned,
                additions,
                deletions,
                diff_text,
            });
        }
    }

    file_changes
}

fn normalize_to_session(conv: NormalizedConversation) -> Session {
    let now = Utc::now().to_rfc3339();
    let session_id = deterministic_id(&conv.agent_slug, &conv.external_id);

    let repo_name = conv.workspace.as_ref().and_then(|w| {
        std::path::Path::new(w)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
    });

    let messages: Vec<Message> = conv
        .messages
        .iter()
        .map(|m| Message {
            id: format!("{}-msg-{}", session_id, m.idx),
            session_id: session_id.clone(),
            idx: m.idx as i64,
            role: m.role.clone(),
            author: m.author.clone(),
            content: m.content.clone(),
            created_at: m.created_at.clone(),
            extra: m.extra.to_string(),
        })
        .collect();

    let message_count = messages.len() as i64;
    let file_changes = extract_file_changes(&conv.messages, &session_id);
    let file_count = file_changes.len() as i64;

    Session {
        id: session_id,
        tool: tool_display_name(&conv.agent_slug),
        agent_slug: conv.agent_slug,
        source_path: Some(conv.source_path),
        repo_name,
        repo_path: conv.workspace.clone(),
        branch: conv.branch,
        title: conv.title,
        started_at: conv.started_at,
        ended_at: conv.ended_at,
        model: conv.model,
        message_count,
        file_count,
        workspace: conv.workspace,
        external_id: Some(conv.external_id),
        metadata: conv.metadata.to_string(),
        indexed_at: now,
        source_mtime: conv.source_mtime,
        messages,
        file_changes,
    }
}

fn tool_display_name(slug: &str) -> String {
    match slug {
        "claude_code" => "Claude Code".to_string(),
        "copilot" => "GitHub Copilot".to_string(),
        "cursor" => "Cursor".to_string(),
        "aider" => "Aider".to_string(),
        "codex" => "Codex CLI".to_string(),
        "cline" => "Cline".to_string(),
        "gemini" => "Gemini CLI".to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{extract_file_changes, normalize_to_session};
    use crate::models::{NormalizedConversation, NormalizedMessage};

    #[test]
    fn extracts_unique_file_changes_and_keeps_latest_diff() {
        let session_id = "copilot-session";
        let messages = vec![
            NormalizedMessage {
                idx: 0,
                role: "assistant".to_string(),
                author: Some("Copilot".to_string()),
                created_at: None,
                content: String::new(),
                extra: serde_json::json!({
                    "parts": [
                        {
                            "type": "text_edit",
                            "file_path": "src/main.rs",
                            "diff": "--- a/src/main.rs\n+++ b/src/main.rs\n@@ -1 +1 @@\n-old\n+new",
                        },
                        {
                            "type": "text_edit",
                            "file_path": "src/lib.rs",
                            "diff": "--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -0,0 +1,2 @@\n+fn a() {}\n+fn b() {}",
                        }
                    ]
                }),
            },
            NormalizedMessage {
                idx: 1,
                role: "assistant".to_string(),
                author: Some("Copilot".to_string()),
                created_at: None,
                content: String::new(),
                extra: serde_json::json!({
                    "parts": [
                        {
                            "type": "text_edit",
                            "file_path": "src/main.rs",
                            "diff": "--- a/src/main.rs\n+++ b/src/main.rs\n@@ -2 +2 @@\n-before\n+after",
                        }
                    ]
                }),
            },
        ];

        let file_changes = extract_file_changes(&messages, session_id);

        assert_eq!(file_changes.len(), 2);

        let main_rs = file_changes
            .iter()
            .find(|change| change.path == "src/main.rs")
            .unwrap();
        assert_eq!(main_rs.additions, 1);
        assert_eq!(main_rs.deletions, 1);
        assert!(main_rs.diff_text.as_deref().unwrap().contains("+after"));

        let lib_rs = file_changes
            .iter()
            .find(|change| change.path == "src/lib.rs")
            .unwrap();
        assert_eq!(lib_rs.additions, 2);
        assert_eq!(lib_rs.deletions, 0);
    }

    #[test]
    fn normalize_to_session_sets_file_count_from_structured_parts() {
        let session = normalize_to_session(NormalizedConversation {
            agent_slug: "copilot".to_string(),
            external_id: "session-123".to_string(),
            title: Some("Test Session".to_string()),
            workspace: Some("/tmp/recall".to_string()),
            source_path: "/tmp/session.jsonl".to_string(),
            started_at: Some("2026-04-18T00:00:00Z".to_string()),
            ended_at: Some("2026-04-18T00:01:00Z".to_string()),
            metadata: serde_json::json!({}),
            messages: vec![
                NormalizedMessage {
                    idx: 0,
                    role: "user".to_string(),
                    author: None,
                    created_at: None,
                    content: "Update the file".to_string(),
                    extra: serde_json::json!({}),
                },
                NormalizedMessage {
                    idx: 1,
                    role: "assistant".to_string(),
                    author: Some("Copilot".to_string()),
                    created_at: None,
                    content: String::new(),
                    extra: serde_json::json!({
                        "parts": [
                            {
                                "type": "text_edit",
                                "file_path": "src/main.rs",
                                "diff": "--- a/src/main.rs\n+++ b/src/main.rs\n@@ -1 +1 @@\n-old\n+new",
                            }
                        ]
                    }),
                },
            ],
            model: Some("gpt-4.1".to_string()),
            branch: None,
            source_mtime: Some("2026-04-18T00:01:00Z".to_string()),
        });

        assert_eq!(session.file_count, 1);
        assert_eq!(session.file_changes.len(), 1);
        assert_eq!(session.file_changes[0].path, "src/main.rs");
        assert_eq!(session.file_changes[0].additions, 1);
        assert_eq!(session.file_changes[0].deletions, 1);
    }
}
