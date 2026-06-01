//! Session export formatters.
//!
//! These produce the string payload that the frontend downloads when the
//! user hits "Export" in the session detail view. The frontend is
//! responsible for writing it to disk — this module only assembles the
//! text content and the filename.

use crate::modules::sessions::models::{ExportData, Session};

type AppResult<T> = Result<T, String>;

/// Build an export payload from a session. Supported formats:
///
/// - `"json"`   — pretty-printed Serde JSON (file extension `.json`)
/// - `"md"` / `"markdown"` — GitHub-flavoured markdown transcript (`.md`)
/// - anything else — plain text transcript (`.txt`)
pub fn build_export(session: &Session, format: &str) -> AppResult<ExportData> {
    let (content, extension) = match format {
        "json" => (
            serde_json::to_string_pretty(session).map_err(|err| err.to_string())?,
            "json",
        ),
        "markdown" | "md" => (build_markdown(session), "md"),
        _ => (build_text(session), "txt"),
    };

    Ok(ExportData {
        format: format.to_string(),
        content,
        filename: format!(
            "{}.{}",
            sanitize_filename(session.title.as_deref()),
            extension
        ),
    })
}

fn build_markdown(session: &Session) -> String {
    let mut out = String::new();

    out.push_str(&format!(
        "# {}\n\n",
        session.title.as_deref().unwrap_or("Untitled Session"),
    ));
    out.push_str(&format!("**Tool:** {}\n", session.tool));

    if let Some(repo_path) = &session.repo_path {
        out.push_str(&format!("**Repository:** {}\n", repo_path));
    }

    if let Some(started_at) = &session.started_at {
        out.push_str(&format!("**Started:** {}\n", started_at));
    }

    out.push_str("\n---\n\n");

    for message in &session.messages {
        let role_label = match message.role.as_str() {
            "user" => "**You**",
            "assistant" => "**Assistant**",
            other => other,
        };

        out.push_str(&format!("### {}\n\n{}\n\n", role_label, message.content));
    }

    out
}

fn build_text(session: &Session) -> String {
    let mut out = String::new();

    out.push_str(&format!(
        "{}\n",
        session.title.as_deref().unwrap_or("Untitled Session"),
    ));
    out.push_str(&format!("Tool: {}\n", session.tool));
    out.push_str("---\n\n");

    for message in &session.messages {
        out.push_str(&format!("[{}]: {}\n\n", message.role, message.content));
    }

    out
}

/// Sanitize the session title into a filesystem-safe filename fragment.
///
/// Non-alphanumeric characters are replaced with `-`, and the result is
/// clamped to 30 characters. A missing title falls back to `session`.
fn sanitize_filename(title: Option<&str>) -> String {
    title
        .unwrap_or("session")
        .chars()
        .take(30)
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::sessions::models::{FileChange, Message, Session};

    fn sample() -> Session {
        Session {
            id: "id".into(),
            tool: "copilot".into(),
            agent_slug: "copilot".into(),
            source_path: None,
            repo_name: None,
            repo_path: None,
            branch: None,
            title: Some("Hello / World".into()),
            started_at: None,
            ended_at: None,
            model: None,
            message_count: 1,
            file_count: 0,
            workspace: None,
            external_id: None,
            metadata: "{}".into(),
            indexed_at: "2025-01-01T00:00:00Z".into(),
            source_mtime: None,
            messages: vec![Message {
                id: "m".into(),
                session_id: "id".into(),
                idx: 0,
                role: "user".into(),
                author: None,
                content: "hi".into(),
                created_at: None,
                extra: "{}".into(),
            }],
            file_changes: Vec::<FileChange>::new(),
        }
    }

    #[test]
    fn sanitize_filename_strips_separators() {
        assert_eq!(sanitize_filename(Some("Hello / World")), "Hello---World");
    }

    #[test]
    fn sanitize_filename_falls_back() {
        assert_eq!(sanitize_filename(None), "session");
    }

    #[test]
    fn markdown_export_has_title_and_messages() {
        let out = build_markdown(&sample());
        assert!(out.starts_with("# Hello / World"));
        assert!(out.contains("**You**"));
        assert!(out.contains("hi"));
    }

    #[test]
    fn json_export_roundtrips() {
        let export = build_export(&sample(), "json").unwrap();
        assert_eq!(export.filename, "Hello---World.json");
        let value: serde_json::Value = serde_json::from_str(&export.content).unwrap();
        assert_eq!(value["tool"], "copilot");
    }
}
