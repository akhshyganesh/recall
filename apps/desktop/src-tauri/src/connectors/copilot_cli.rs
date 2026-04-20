use crate::connectors::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};
use std::fs;
use std::path::{Path, PathBuf};

pub struct CopilotCliConnector;

#[derive(Debug, Clone, Default)]
struct WorkspaceMetadata {
    session_id: Option<String>,
    cwd: Option<String>,
    git_root: Option<String>,
    repository: Option<String>,
    host_type: Option<String>,
    branch: Option<String>,
    summary: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

impl CopilotCliConnector {
    pub fn new() -> Self {
        Self
    }

    fn session_state_root(&self) -> Option<PathBuf> {
        dirs::home_dir()
            .map(|home| home.join(".copilot/session-state"))
            .filter(|path| path.is_dir())
    }

    fn session_dirs_for_root(root: &Path) -> Vec<PathBuf> {
        if root.join("events.jsonl").is_file() {
            return vec![root.to_path_buf()];
        }

        let mut session_dirs = Vec::new();

        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() && path.join("events.jsonl").is_file() {
                    session_dirs.push(path);
                }
            }
        }

        session_dirs
    }

    fn parse_workspace_yaml(&self, path: &Path) -> WorkspaceMetadata {
        let Ok(content) = fs::read_to_string(path) else {
            return WorkspaceMetadata::default();
        };

        let mut metadata = WorkspaceMetadata::default();

        for raw_line in content.lines() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            let Some((key, raw_value)) = line.split_once(':') else {
                continue;
            };

            let value = Self::parse_yaml_scalar(raw_value);
            match key.trim() {
                "id" => metadata.session_id = Some(value),
                "cwd" => metadata.cwd = Some(value),
                "git_root" => metadata.git_root = Some(value),
                "repository" => metadata.repository = Some(value),
                "host_type" => metadata.host_type = Some(value),
                "branch" => metadata.branch = Some(value),
                "summary" => metadata.summary = Some(value),
                "created_at" => metadata.created_at = Some(value),
                "updated_at" => metadata.updated_at = Some(value),
                _ => {}
            }
        }

        metadata
    }

    fn parse_yaml_scalar(raw_value: &str) -> String {
        let value = raw_value.trim();

        if let Some(stripped) = value.strip_prefix('"').and_then(|v| v.strip_suffix('"')) {
            return stripped.to_string();
        }

        if let Some(stripped) = value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')) {
            return stripped.to_string();
        }

        value.to_string()
    }

    fn path_mtime_rfc3339(path: &Path) -> Option<String> {
        if !path.exists() {
            return None;
        }

        fs::metadata(path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(|modified| chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339())
    }

    fn latest_source_mtime(session_dir: &Path) -> Option<String> {
        [
            session_dir.join("events.jsonl"),
            session_dir.join("workspace.yaml"),
            session_dir.join("vscode.metadata.json"),
        ]
        .iter()
        .filter_map(|path| Self::path_mtime_rfc3339(path))
        .max()
    }

    fn parse_events_file(
        &self,
        path: &Path,
        workspace_meta: &WorkspaceMetadata,
    ) -> Option<NormalizedConversation> {
        let content = fs::read_to_string(path).ok()?;

        let mut messages = Vec::new();
        let mut workspace = workspace_meta
            .git_root
            .clone()
            .or_else(|| workspace_meta.cwd.clone());
        let mut branch = workspace_meta.branch.clone();
        let mut title = workspace_meta
            .summary
            .clone()
            .filter(|value| !value.trim().is_empty());
        let mut started_at = workspace_meta.created_at.clone();
        let mut ended_at = workspace_meta.updated_at.clone();
        let mut model = None;
        let mut session_id = workspace_meta
            .session_id
            .clone()
            .or_else(|| {
                path.parent()
                    .and_then(|dir| dir.file_name())
                    .map(|name| name.to_string_lossy().to_string())
            })
            .unwrap_or_else(|| path.to_string_lossy().to_string());
        let mut repository = workspace_meta.repository.clone();
        let mut host_type = workspace_meta.host_type.clone();
        let mut summary = workspace_meta.summary.clone();
        let mut copilot_version = None;
        let mut remote_steerable = None;
        let mut session_context = serde_json::json!({});
        let mut first_user_message = None;

        for raw_line in content.lines() {
            let line = raw_line.trim();
            if line.is_empty() {
                continue;
            }

            let Ok(event) = serde_json::from_str::<serde_json::Value>(line) else {
                continue;
            };

            let event_type = event
                .get("type")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            let data = event
                .get("data")
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            let timestamp = event
                .get("timestamp")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());

            if let Some(ts) = timestamp.clone() {
                ended_at = Some(ts);
            }

            match event_type {
                "session.start" => {
                    if let Some(value) = Self::message_text(data.get("sessionId")) {
                        session_id = value;
                    }

                    if started_at.is_none() {
                        started_at =
                            Self::message_text(data.get("startTime")).or(timestamp.clone());
                    }

                    if let Some(context) = data.get("context") {
                        session_context = context.clone();

                        workspace = Self::first_non_empty_text(&[
                            context.get("gitRoot"),
                            context.get("cwd"),
                        ])
                        .or(workspace);
                        branch = Self::message_text(context.get("branch")).or(branch);
                        repository = Self::message_text(context.get("repository")).or(repository);
                        host_type = Self::message_text(context.get("hostType")).or(host_type);
                    }

                    copilot_version =
                        Self::message_text(data.get("copilotVersion")).or(copilot_version);
                    remote_steerable = data
                        .get("remoteSteerable")
                        .and_then(|value| value.as_bool());
                }
                "session.model_change" => {
                    model = Self::first_non_empty_text(&[data.get("newModel"), data.get("model")])
                        .or(model);
                }
                "system.message" if model.is_none() => {
                    if let Some(content) = Self::message_text(data.get("content")) {
                        model = Self::extract_model_from_system_message(&content);
                    }
                }
                "user.message" => {
                    let Some(content) = Self::message_text(data.get("content"))
                        .or_else(|| Self::message_text(data.get("transformedContent")))
                    else {
                        continue;
                    };

                    if first_user_message.is_none() {
                        first_user_message = Some(content.clone());
                    }

                    messages.push(NormalizedMessage {
                        idx: messages.len(),
                        role: "user".to_string(),
                        author: None,
                        created_at: timestamp,
                        content,
                        extra: serde_json::json!({}),
                    });
                }
                "assistant.message" => {
                    let content = Self::message_text(data.get("content")).unwrap_or_default();
                    let reasoning =
                        Self::message_text(data.get("reasoningText")).unwrap_or_default();
                    let mut structured_parts = Vec::new();

                    if !content.is_empty() {
                        structured_parts.push(serde_json::json!({
                            "type": "text",
                            "content": content,
                        }));
                    }

                    if !reasoning.is_empty() {
                        structured_parts.push(serde_json::json!({
                            "type": "thinking",
                            "content": reasoning,
                            "title": "Thinking...",
                        }));
                    }

                    if let Some(tool_requests) =
                        data.get("toolRequests").and_then(|value| value.as_array())
                    {
                        for tool_request in tool_requests {
                            if let Some(tool_part) = Self::tool_call_part(tool_request) {
                                structured_parts.push(tool_part);
                            }
                        }
                    }

                    let has_visible_parts = structured_parts.iter().any(|part| {
                        matches!(
                            part.get("type").and_then(|value| value.as_str()),
                            Some("text") | Some("thinking") | Some("tool_call")
                        )
                    });

                    if !has_visible_parts {
                        continue;
                    }

                    messages.push(NormalizedMessage {
                        idx: messages.len(),
                        role: "assistant".to_string(),
                        author: Some("Copilot CLI".to_string()),
                        created_at: timestamp,
                        content,
                        extra: serde_json::json!({ "parts": structured_parts }),
                    });
                }
                "session.info" if model.is_none() => {
                    model = Self::message_text(data.get("message")).and_then(|message| {
                        message
                            .strip_prefix("Model changed to:")
                            .map(|rest| rest.trim().to_string())
                    });
                }
                _ => {}
            }
        }

        if messages.is_empty() {
            return None;
        }

        if title.is_none() {
            title = first_user_message
                .as_deref()
                .map(|message| first_line(message, 100));
        }

        if summary.is_none() {
            summary = title.clone();
        }

        let source_mtime = path.parent().and_then(Self::latest_source_mtime);

        Some(NormalizedConversation {
            agent_slug: "copilot_cli".to_string(),
            external_id: session_id,
            title,
            workspace,
            source_path: path.to_string_lossy().to_string(),
            started_at: started_at.or(source_mtime.clone()),
            ended_at: ended_at.or(source_mtime.clone()),
            metadata: serde_json::json!({
                "source": "copilot_cli",
                "repository": repository,
                "host_type": host_type,
                "summary": summary,
                "copilot_version": copilot_version,
                "remote_steerable": remote_steerable,
                "session_context": session_context,
            }),
            messages,
            model,
            branch,
            source_mtime,
        })
    }

    fn message_text(value: Option<&serde_json::Value>) -> Option<String> {
        let text = value.and_then(|value| value.as_str())?;
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }

    fn first_non_empty_text(values: &[Option<&serde_json::Value>]) -> Option<String> {
        for value in values {
            if let Some(text) = Self::message_text(*value) {
                return Some(text);
            }
        }

        None
    }

    fn tool_call_part(tool_request: &serde_json::Value) -> Option<serde_json::Value> {
        let tool_name = Self::message_text(tool_request.get("name"))?;
        if tool_name == "report_intent" {
            return None;
        }

        let message = Self::message_text(tool_request.get("intentionSummary"))
            .unwrap_or_else(|| format!("Used {}", tool_name));
        let mut part = serde_json::json!({
            "type": "tool_call",
            "tool": tool_name,
            "message": message,
            "complete": true,
        });

        if let Some(description) = Self::summarize_tool_arguments(tool_request.get("arguments")) {
            part["description"] = serde_json::json!(description);
        }

        Some(part)
    }

    fn summarize_tool_arguments(arguments: Option<&serde_json::Value>) -> Option<String> {
        let arguments = arguments?;

        if let Some(intent) = Self::message_text(arguments.get("intent")) {
            return Some(Self::collapse_whitespace(&intent));
        }

        let mut parts = Vec::new();

        for key in [
            "path",
            "filePath",
            "dirPath",
            "workspaceFolder",
            "query",
            "pattern",
            "command",
            "url",
            "name",
            "goal",
            "label",
            "description",
        ] {
            if let Some(value) = arguments.get(key).and_then(Self::summarize_json_value) {
                parts.push(format!("{}: {}", key, value));
            }
            if parts.len() >= 2 {
                break;
            }
        }

        if parts.is_empty() {
            if let Some(object) = arguments.as_object() {
                for (key, value) in object {
                    if key == "intent" {
                        continue;
                    }
                    if let Some(summary) = Self::summarize_json_value(value) {
                        parts.push(format!("{}: {}", key, summary));
                    }
                    if parts.len() >= 2 {
                        break;
                    }
                }
            }
        }

        if parts.is_empty() {
            None
        } else {
            Some(parts.join(" | "))
        }
    }

    fn summarize_json_value(value: &serde_json::Value) -> Option<String> {
        match value {
            serde_json::Value::String(text) => {
                let collapsed = Self::collapse_whitespace(text);
                if collapsed.is_empty() {
                    None
                } else {
                    Some(collapsed)
                }
            }
            serde_json::Value::Number(number) => Some(number.to_string()),
            serde_json::Value::Bool(boolean) => Some(boolean.to_string()),
            serde_json::Value::Array(values) => {
                if values.is_empty() {
                    return None;
                }

                let joined = values
                    .iter()
                    .filter_map(Self::summarize_json_value)
                    .take(3)
                    .collect::<Vec<_>>()
                    .join(", ");

                if joined.is_empty() {
                    Some(format!("{} items", values.len()))
                } else {
                    Some(joined)
                }
            }
            serde_json::Value::Object(object) => {
                for key in [
                    "path",
                    "filePath",
                    "dirPath",
                    "query",
                    "pattern",
                    "command",
                    "url",
                    "name",
                    "description",
                    "message",
                ] {
                    if let Some(text) = object.get(key).and_then(Self::summarize_json_value) {
                        return Some(text);
                    }
                }

                None
            }
            _ => None,
        }
    }

    fn collapse_whitespace(text: &str) -> String {
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn extract_model_from_system_message(content: &str) -> Option<String> {
        let fragment = content.split("<model").nth(1)?;
        let model_fragment = fragment.split("/>").next().unwrap_or(fragment);

        Self::extract_attribute(model_fragment, "id")
            .or_else(|| Self::extract_attribute(model_fragment, "name"))
    }

    fn extract_attribute(content: &str, attribute: &str) -> Option<String> {
        let needle = format!(r#"{}=\""#, attribute);
        let start = content.find(&needle)? + needle.len();
        let rest = &content[start..];
        let end = rest.find('"')?;
        Some(rest[..end].to_string())
    }
}

impl Connector for CopilotCliConnector {
    fn name(&self) -> &str {
        "GitHub Copilot CLI"
    }

    fn agent_slug(&self) -> &str {
        "copilot_cli"
    }

    fn detect(&self) -> DetectionResult {
        let Some(root) = self.session_state_root() else {
            return DetectionResult {
                detected: false,
                root_paths: vec![],
                evidence: "No Copilot CLI session-state directory found".to_string(),
            };
        };

        let session_count = Self::session_dirs_for_root(&root).len();
        if session_count == 0 {
            return DetectionResult {
                detected: false,
                root_paths: vec![root.to_string_lossy().to_string()],
                evidence: "Copilot CLI session-state directory exists but contains no sessions"
                    .to_string(),
            };
        }

        DetectionResult {
            detected: true,
            root_paths: vec![root.to_string_lossy().to_string()],
            evidence: format!(
                "Found {} Copilot CLI session directories in {}",
                session_count,
                root.display()
            ),
        }
    }

    fn scan(&self, roots: &[String], since_ts: Option<&str>) -> Vec<NormalizedConversation> {
        let scan_roots: Vec<PathBuf> = if roots.is_empty() {
            self.session_state_root().into_iter().collect()
        } else {
            roots.iter().map(PathBuf::from).collect()
        };

        let mut conversations = Vec::new();

        for root in scan_roots {
            for session_dir in Self::session_dirs_for_root(&root) {
                let source_mtime = Self::latest_source_mtime(&session_dir);
                if let Some(since) = since_ts {
                    if let Some(mtime) = source_mtime.as_deref() {
                        if mtime < since {
                            continue;
                        }
                    }
                }

                let events_path = session_dir.join("events.jsonl");
                let workspace_metadata =
                    self.parse_workspace_yaml(&session_dir.join("workspace.yaml"));

                if let Some(conversation) =
                    self.parse_events_file(&events_path, &workspace_metadata)
                {
                    conversations.push(conversation);
                }
            }
        }

        conversations
    }
}

fn first_line(text: &str, max_len: usize) -> String {
    let first = text
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or(text)
        .trim();
    let truncated: String = first.chars().take(max_len).collect();

    if first.chars().count() > max_len {
        format!("{}...", truncated)
    } else {
        truncated
    }
}

#[cfg(test)]
mod tests {
    use super::CopilotCliConnector;
    use std::fs;

    #[test]
    fn parses_copilot_cli_session_files() {
        let session_root =
            std::env::temp_dir().join(format!("recall-copilot-cli-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&session_root).unwrap();

        let workspace_yaml = session_root.join("workspace.yaml");
        fs::write(
            &workspace_yaml,
            "id: session-1\ncwd: /tmp/project\ngit_root: /tmp/project\nrepository: owner/repo\nhost_type: github\nbranch: develop\nsummary: Fix README Layout\ncreated_at: 2026-04-18T06:36:43.294Z\nupdated_at: 2026-04-18T06:39:30.669Z\n",
        )
        .unwrap();

        let events_path = session_root.join("events.jsonl");
        fs::write(
            &events_path,
            concat!(
                "{\"type\":\"session.start\",\"data\":{\"sessionId\":\"session-1\",\"copilotVersion\":\"1.0.32\",\"context\":{\"cwd\":\"/tmp/project\",\"gitRoot\":\"/tmp/project\",\"branch\":\"develop\",\"repository\":\"owner/repo\",\"hostType\":\"github\"}},\"timestamp\":\"2026-04-18T06:37:24.345Z\"}\n",
                "{\"type\":\"session.model_change\",\"data\":{\"newModel\":\"gpt-5.4\"},\"timestamp\":\"2026-04-18T06:37:28.740Z\"}\n",
                "{\"type\":\"user.message\",\"data\":{\"content\":\"Fix the README\"},\"timestamp\":\"2026-04-18T06:39:13.072Z\"}\n",
                "{\"type\":\"assistant.message\",\"data\":{\"content\":\"I am checking the README.\",\"reasoningText\":\"Need to inspect the docs.\",\"toolRequests\":[{\"name\":\"view\",\"intentionSummary\":\"Read README\",\"arguments\":{\"path\":\"/tmp/project/README.md\"}},{\"name\":\"report_intent\",\"arguments\":{\"intent\":\"Exploring docs\"}}]},\"timestamp\":\"2026-04-18T06:39:14.000Z\"}\n"
            ),
        )
        .unwrap();

        let connector = CopilotCliConnector::new();
        let workspace_metadata = connector.parse_workspace_yaml(&workspace_yaml);
        let conversation = connector
            .parse_events_file(&events_path, &workspace_metadata)
            .unwrap();

        assert_eq!(conversation.agent_slug, "copilot_cli");
        assert_eq!(conversation.external_id, "session-1");
        assert_eq!(conversation.title.as_deref(), Some("Fix README Layout"));
        assert_eq!(conversation.workspace.as_deref(), Some("/tmp/project"));
        assert_eq!(conversation.branch.as_deref(), Some("develop"));
        assert_eq!(conversation.model.as_deref(), Some("gpt-5.4"));
        assert_eq!(conversation.messages.len(), 2);
        assert_eq!(conversation.messages[0].role, "user");
        assert_eq!(conversation.messages[0].content, "Fix the README");

        let assistant = &conversation.messages[1];
        assert_eq!(assistant.role, "assistant");
        assert_eq!(assistant.content, "I am checking the README.");
        let parts = assistant
            .extra
            .get("parts")
            .and_then(|value| value.as_array())
            .unwrap();
        assert_eq!(parts.len(), 3);
        assert_eq!(
            parts[1].get("type").and_then(|value| value.as_str()),
            Some("thinking")
        );
        assert_eq!(
            parts[2].get("tool").and_then(|value| value.as_str()),
            Some("view")
        );

        fs::remove_dir_all(&session_root).unwrap();
    }
}
