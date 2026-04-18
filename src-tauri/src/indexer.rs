use crate::connectors;
use crate::models::{DetectionResult, Message, NormalizedConversation, Session};
use chrono::Utc;
use std::sync::mpsc;

pub struct Indexer;

impl Indexer {
    pub fn detect_all() -> Vec<(String, String, DetectionResult)> {
        let connectors = connectors::all_connectors();
        connectors.iter().map(|c| {
            let result = c.detect();
            (c.name().to_string(), c.agent_slug().to_string(), result)
        }).collect()
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
                if !detection.detected { continue; }

                let conversations = connector.scan(
                    &detection.root_paths,
                    since_owned.as_deref(),
                );
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
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    agent_slug.hash(&mut hasher);
    external_id.hash(&mut hasher);
    let hash = hasher.finish();
    format!("{}-{:016x}", agent_slug, hash)
}

fn normalize_to_session(conv: NormalizedConversation) -> Session {
    let now = Utc::now().to_rfc3339();
    let session_id = deterministic_id(&conv.agent_slug, &conv.external_id);

    let repo_name = conv.workspace.as_ref().and_then(|w| {
        std::path::Path::new(w).file_name().map(|n| n.to_string_lossy().to_string())
    });

    let messages: Vec<Message> = conv.messages.iter().map(|m| {
        Message {
            id: format!("{}-msg-{}", session_id, m.idx),
            session_id: session_id.clone(),
            idx: m.idx as i64,
            role: m.role.clone(),
            author: m.author.clone(),
            content: m.content.clone(),
            created_at: m.created_at.clone(),
            extra: m.extra.to_string(),
        }
    }).collect();

    let message_count = messages.len() as i64;

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
        file_count: 0,
        workspace: conv.workspace,
        external_id: Some(conv.external_id),
        metadata: conv.metadata.to_string(),
        indexed_at: now,
        source_mtime: conv.source_mtime,
        messages,
        file_changes: Vec::new(),
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
