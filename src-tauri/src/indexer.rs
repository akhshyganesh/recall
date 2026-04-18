use crate::connectors::{self, Connector};
use crate::db::Database;
use crate::models::{NormalizedConversation, Session, Message, FileChange, DetectionResult};
use chrono::Utc;

pub struct Indexer;

impl Indexer {
    pub fn detect_all() -> Vec<(String, String, DetectionResult)> {
        let connectors = connectors::all_connectors();
        connectors.iter().map(|c| {
            let result = c.detect();
            (c.name().to_string(), c.agent_slug().to_string(), result)
        }).collect()
    }

    pub fn scan_all(db: &Database, since_ts: Option<&str>) -> Result<usize, String> {
        let connectors = connectors::all_connectors();
        let mut total = 0;

        for connector in &connectors {
            let detection = connector.detect();
            if !detection.detected { continue; }

            let conversations = connector.scan(&detection.root_paths, since_ts);
            for conv in conversations {
                let session = normalize_to_session(conv);
                db.upsert_session(&session)?;
                total += 1;
            }
        }

        Ok(total)
    }

    pub fn scan_connector(db: &Database, agent_slug: &str, roots: &[String], since_ts: Option<&str>) -> Result<usize, String> {
        let connectors = connectors::all_connectors();
        let connector = connectors.iter()
            .find(|c| c.agent_slug() == agent_slug)
            .ok_or_else(|| format!("Unknown connector: {}", agent_slug))?;

        let conversations = connector.scan(roots, since_ts);
        let mut total = 0;

        for conv in conversations {
            let session = normalize_to_session(conv);
            db.upsert_session(&session)?;
            total += 1;
        }

        Ok(total)
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
