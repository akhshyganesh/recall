use crate::connectors::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub struct AntigravityConnector;

impl AntigravityConnector {
    pub fn new() -> Self {
        Self
    }

    fn default_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();

        if let Some(home) = dirs::home_dir() {
            roots.push(home.join(".gemini/antigravity"));
        }

        if cfg!(target_os = "macos") {
            if let Some(home) = dirs::home_dir() {
                roots.push(home.join("Library/Application Support/Antigravity"));
            }
        } else if cfg!(target_os = "windows") {
            if let Some(config) = dirs::config_dir() {
                roots.push(config.join("Antigravity"));
            }
        } else if let Some(home) = dirs::home_dir() {
            roots.push(home.join(".config/Antigravity"));
        }

        roots
    }

    fn normalize_legacy_scan_root(root: &Path) -> PathBuf {
        if root.file_name().and_then(|name| name.to_str()) == Some("User") {
            return root.to_path_buf();
        }

        if matches!(
            root.file_name().and_then(|name| name.to_str()),
            Some("workspaceStorage") | Some("globalStorage")
        ) {
            return root
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| root.to_path_buf());
        }

        if root.file_name().and_then(|name| name.to_str()) == Some("chatSessions") {
            return root
                .parent()
                .and_then(Path::parent)
                .map(Path::to_path_buf)
                .unwrap_or_else(|| root.to_path_buf());
        }

        if root.join("User").is_dir() {
            return root.join("User");
        }

        root.to_path_buf()
    }

    fn has_brain_storage(root: &Path) -> bool {
        Self::brain_root(root).is_some()
    }

    fn has_legacy_storage(root: &Path) -> bool {
        let user_root = Self::normalize_legacy_scan_root(root);
        user_root.join("workspaceStorage").is_dir()
            || user_root.join("globalStorage/state.vscdb").is_file()
    }

    fn brain_root(root: &Path) -> Option<PathBuf> {
        if root.file_name().and_then(|name| name.to_str()) == Some("brain") && root.is_dir() {
            return Some(root.to_path_buf());
        }

        let brain_root = root.join("brain");
        if brain_root.is_dir() {
            return Some(brain_root);
        }

        None
    }

    fn collect_legacy_session_dirs(&self, root: &Path) -> Vec<(PathBuf, Option<String>)> {
        let user_root = Self::normalize_legacy_scan_root(root);
        let mut session_dirs = Vec::new();

        let empty_window_dir = user_root.join("globalStorage/emptyWindowChatSessions");
        if empty_window_dir.is_dir() {
            session_dirs.push((empty_window_dir, None));
        }

        let legacy_empty_window_dir = user_root.join("workspaceStorage/no-workspace/chatSessions");
        if legacy_empty_window_dir.is_dir() {
            session_dirs.push((legacy_empty_window_dir, None));
        }

        let workspace_storage_root = user_root.join("workspaceStorage");
        if let Ok(entries) = fs::read_dir(&workspace_storage_root) {
            for entry in entries.flatten() {
                let workspace_dir = entry.path();
                if !workspace_dir.is_dir() {
                    continue;
                }

                let chat_sessions_dir = workspace_dir.join("chatSessions");
                if chat_sessions_dir.is_dir() {
                    session_dirs.push((
                        chat_sessions_dir,
                        Self::read_workspace_folder(&workspace_dir),
                    ));
                }
            }
        }

        session_dirs
    }

    fn collect_brain_session_dirs(&self, root: &Path) -> Vec<PathBuf> {
        let Some(brain_root) = Self::brain_root(root) else {
            return Vec::new();
        };

        let mut session_dirs = Vec::new();

        if let Ok(entries) = fs::read_dir(brain_root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    session_dirs.push(path);
                }
            }
        }

        session_dirs
    }

    fn path_mtime_rfc3339(path: &Path) -> Option<String> {
        fs::metadata(path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(|modified| chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339())
    }

    fn collect_brain_artifact_paths(session_dir: &Path) -> Vec<PathBuf> {
        let mut artifact_paths = Vec::new();

        if let Ok(entries) = fs::read_dir(session_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                let file_name = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("");
                let is_markdown = path.extension().and_then(|ext| ext.to_str()) == Some("md");
                let is_markdown_metadata = file_name.ends_with(".md.metadata.json");

                if is_markdown || is_markdown_metadata {
                    artifact_paths.push(path);
                }
            }
        }

        artifact_paths
    }

    fn read_artifact_metadata(path: &Path) -> Option<Value> {
        let metadata_path = PathBuf::from(format!("{}.metadata.json", path.to_string_lossy()));
        let content = fs::read_to_string(metadata_path).ok()?;
        serde_json::from_str(&content).ok()
    }

    fn read_markdown_artifact(path: &Path) -> Option<String> {
        let content = fs::read_to_string(path).ok()?;
        let trimmed = content.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }

    fn artifact_timestamp(path: &Path) -> Option<String> {
        let metadata = Self::read_artifact_metadata(path);
        Self::timestamp_to_rfc3339(
            metadata
                .as_ref()
                .and_then(|value| value.get("updatedAt").or_else(|| value.get("createdAt"))),
        )
        .or_else(|| Self::path_mtime_rfc3339(path))
    }

    fn artifact_summary(path: &Path) -> Option<String> {
        Self::read_artifact_metadata(path)?
            .get("summary")
            .and_then(Self::extract_text)
    }

    fn read_workspace_folder(workspace_dir: &Path) -> Option<String> {
        let content = fs::read_to_string(workspace_dir.join("workspace.json")).ok()?;
        let value: Value = serde_json::from_str(&content).ok()?;
        let raw = value
            .get("folder")
            .and_then(|folder| folder.as_str())
            .or_else(|| value.get("folderUri").and_then(|folder| folder.as_str()))
            .or_else(|| {
                value
                    .get("workspace")
                    .and_then(|workspace| workspace.get("configPath"))
                    .and_then(|config_path| config_path.as_str())
            })?;

        Some(Self::decode_file_uri(raw))
    }

    fn decode_file_uri(path: &str) -> String {
        if let Some(stripped) = path.strip_prefix("file://") {
            let decoded = urlencoding::decode(stripped)
                .map(|value| value.into_owned())
                .unwrap_or_else(|_| stripped.to_string());
            return Self::normalize_file_uri_path(&decoded);
        }

        path.to_string()
    }

    fn normalize_file_uri_path(path: &str) -> String {
        let bytes = path.as_bytes();
        if bytes.len() >= 3
            && bytes[0] == b'/'
            && bytes[2] == b':'
            && bytes[1].is_ascii_alphabetic()
        {
            return path[1..].to_string();
        }

        path.to_string()
    }

    fn millis_to_rfc3339(ms: i64) -> Option<String> {
        chrono::DateTime::from_timestamp_millis(ms).map(|dt| dt.to_rfc3339())
    }

    fn timestamp_to_rfc3339(value: Option<&Value>) -> Option<String> {
        match value? {
            Value::Number(number) => number.as_i64().and_then(Self::millis_to_rfc3339),
            Value::String(text) => text
                .parse::<i64>()
                .ok()
                .and_then(Self::millis_to_rfc3339)
                .or_else(|| {
                    chrono::DateTime::parse_from_rfc3339(text)
                        .ok()
                        .map(|timestamp| timestamp.to_rfc3339())
                }),
            _ => None,
        }
    }

    fn join_fragments(parts: Vec<String>) -> Option<String> {
        let joined = parts
            .into_iter()
            .map(|part| part.trim().to_string())
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n");

        if joined.is_empty() {
            None
        } else {
            Some(joined)
        }
    }

    fn extract_text(value: &Value) -> Option<String> {
        match value {
            Value::String(text) => {
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }
            Value::Number(number) => Some(number.to_string()),
            Value::Bool(boolean) => Some(boolean.to_string()),
            Value::Array(items) => Self::join_fragments(
                items
                    .iter()
                    .filter_map(Self::extract_text)
                    .collect::<Vec<_>>(),
            ),
            Value::Object(_) => {
                for key in [
                    "text", "markdown", "value", "message", "content", "prompt", "body", "label",
                    "title", "response",
                ] {
                    if let Some(text) = value.get(key).and_then(Self::extract_text) {
                        return Some(text);
                    }
                }

                if let Some(parts) = value.get("parts").and_then(|parts| parts.as_array()) {
                    return Self::join_fragments(
                        parts
                            .iter()
                            .filter_map(Self::extract_text)
                            .collect::<Vec<_>>(),
                    );
                }

                None
            }
            _ => None,
        }
    }

    fn extract_request_text(request: &Value) -> Option<String> {
        request
            .get("message")
            .and_then(Self::extract_text)
            .or_else(|| request.get("prompt").and_then(Self::extract_text))
            .or_else(|| request.get("text").and_then(Self::extract_text))
    }

    fn extract_response_text(request: &Value) -> Option<String> {
        request
            .get("response")
            .and_then(Self::extract_text)
            .or_else(|| request.get("result").and_then(Self::extract_text))
            .or_else(|| request.get("content").and_then(Self::extract_text))
    }

    fn extract_request_timestamp(request: &Value) -> Option<String> {
        Self::timestamp_to_rfc3339(
            request
                .get("timestamp")
                .or_else(|| request.get("createdAt"))
                .or_else(|| request.get("creationDate")),
        )
        .or_else(|| {
            request.get("response").and_then(|response| {
                Self::timestamp_to_rfc3339(
                    response
                        .get("timestamp")
                        .or_else(|| response.get("createdAt"))
                        .or_else(|| response.get("creationDate")),
                )
            })
        })
    }

    fn extract_model(request: &Value, session: &Value) -> Option<String> {
        request
            .get("userSelectedModelId")
            .and_then(|value| value.as_str())
            .or_else(|| request.get("modelId").and_then(|value| value.as_str()))
            .or_else(|| request.get("model").and_then(|value| value.as_str()))
            .or_else(|| {
                request
                    .get("response")
                    .and_then(|response| response.get("model"))
                    .and_then(|value| value.as_str())
            })
            .or_else(|| session.get("model").and_then(|value| value.as_str()))
            .map(|value| value.to_string())
    }

    fn parse_session_value(
        &self,
        path: &Path,
        session: &Value,
        workspace: Option<String>,
    ) -> Option<NormalizedConversation> {
        let requests = session.get("requests")?.as_array()?;
        let mut messages = Vec::new();
        let responder = session
            .get("responderUsername")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
        let mut model = None;

        for request in requests {
            let created_at = Self::extract_request_timestamp(request);

            if let Some(content) = Self::extract_request_text(request) {
                messages.push(NormalizedMessage {
                    idx: 0,
                    role: "user".to_string(),
                    author: None,
                    created_at: created_at.clone(),
                    content,
                    extra: serde_json::json!({}),
                });
            }

            if let Some(content) = Self::extract_response_text(request) {
                if model.is_none() {
                    model = Self::extract_model(request, session);
                }

                messages.push(NormalizedMessage {
                    idx: 0,
                    role: "assistant".to_string(),
                    author: responder.clone(),
                    created_at,
                    content,
                    extra: serde_json::json!({}),
                });
            }
        }

        if messages.is_empty() {
            return None;
        }

        for (index, message) in messages.iter_mut().enumerate() {
            message.idx = index;
        }

        let file_mtime = fs::metadata(path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(|modified| chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339());

        let title = session
            .get("customTitle")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
            .or_else(|| {
                messages
                    .iter()
                    .find(|message| message.role == "user")
                    .map(|message| first_line(&message.content, 100))
            });

        let started_at = Self::timestamp_to_rfc3339(session.get("creationDate"))
            .or_else(|| {
                messages
                    .first()
                    .and_then(|message| message.created_at.clone())
            })
            .or(file_mtime.clone());
        let ended_at = Self::timestamp_to_rfc3339(session.get("lastMessageDate"))
            .or_else(|| {
                messages
                    .last()
                    .and_then(|message| message.created_at.clone())
            })
            .or(file_mtime.clone());

        let session_id = session
            .get("sessionId")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .or_else(|| {
                path.file_stem()
                    .and_then(|stem| stem.to_str())
                    .map(|stem| stem.to_string())
            })?;

        let mut metadata = serde_json::json!({});
        if let Some(initial_location) = session.get("initialLocation") {
            metadata["initialLocation"] = initial_location.clone();
        }
        if let Some(responder_username) = responder.as_ref() {
            metadata["responderUsername"] = serde_json::json!(responder_username);
        }

        Some(NormalizedConversation {
            agent_slug: "antigravity".to_string(),
            external_id: session_id,
            title,
            workspace,
            source_path: path.to_string_lossy().to_string(),
            started_at,
            ended_at,
            metadata,
            messages,
            model,
            branch: None,
            source_mtime: file_mtime,
        })
    }

    fn parse_session_file(
        &self,
        path: &Path,
        workspace: Option<String>,
    ) -> Option<NormalizedConversation> {
        let content = fs::read_to_string(path).ok()?;
        let session: Value = serde_json::from_str(&content).ok()?;
        self.parse_session_value(path, &session, workspace)
    }

    fn parse_brain_session_dir(&self, session_dir: &Path) -> Option<NormalizedConversation> {
        let session_id = session_dir
            .file_name()
            .and_then(|name| name.to_str())?
            .to_string();
        let task_path = session_dir.join("task.md");
        let task_summary = Self::artifact_summary(&task_path);

        let mut messages = Vec::new();
        let mut artifact_names = Vec::new();
        let mut artifact_paths = Self::collect_brain_artifact_paths(session_dir);

        if let Some(content) = Self::read_markdown_artifact(&task_path) {
            artifact_names.push("task.md".to_string());
            messages.push(NormalizedMessage {
                idx: 0,
                role: "user".to_string(),
                author: None,
                created_at: Self::artifact_timestamp(&task_path),
                content,
                extra: serde_json::json!({ "artifact": "task.md" }),
            });
        }

        let mut assistant_artifacts = Vec::new();
        if let Ok(entries) = fs::read_dir(session_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                    continue;
                }

                let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                    continue;
                };

                if file_name == "task.md" {
                    continue;
                }

                let created_at = Self::artifact_timestamp(&path);
                assistant_artifacts.push((path, created_at));
            }
        }

        assistant_artifacts.sort_by(|left, right| {
            left.1
                .as_deref()
                .cmp(&right.1.as_deref())
                .then_with(|| left.0.cmp(&right.0))
        });

        for (path, created_at) in assistant_artifacts {
            let Some(content) = Self::read_markdown_artifact(&path) else {
                continue;
            };

            let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            artifact_names.push(file_name.to_string());
            messages.push(NormalizedMessage {
                idx: 0,
                role: "assistant".to_string(),
                author: Some("Antigravity".to_string()),
                created_at,
                content,
                extra: serde_json::json!({ "artifact": file_name }),
            });
        }

        if messages.is_empty() {
            return None;
        }

        for (index, message) in messages.iter_mut().enumerate() {
            message.idx = index;
        }

        if artifact_paths.is_empty() {
            artifact_paths.push(task_path.clone());
        }

        let source_mtime = artifact_paths
            .iter()
            .filter_map(|path| Self::path_mtime_rfc3339(path))
            .max()
            .or_else(|| Self::path_mtime_rfc3339(session_dir));

        let title = messages
            .iter()
            .find(|message| message.role == "user")
            .map(|message| first_line(&message.content, 100))
            .or(task_summary)
            .or_else(|| {
                messages
                    .first()
                    .map(|message| first_line(&message.content, 100))
            });

        let started_at = messages
            .iter()
            .find(|message| message.role == "user")
            .and_then(|message| message.created_at.clone())
            .or_else(|| {
                messages
                    .first()
                    .and_then(|message| message.created_at.clone())
            })
            .or_else(|| source_mtime.clone());
        let ended_at = messages
            .iter()
            .rev()
            .find_map(|message| message.created_at.clone())
            .or_else(|| source_mtime.clone());

        let mut metadata = serde_json::json!({
            "storage": "brain",
            "artifacts": artifact_names,
        });
        if let Some(summary) = Self::artifact_summary(&task_path) {
            metadata["taskSummary"] = serde_json::json!(summary);
        }

        Some(NormalizedConversation {
            agent_slug: "antigravity".to_string(),
            external_id: session_id,
            title,
            workspace: None,
            source_path: session_dir.to_string_lossy().to_string(),
            started_at,
            ended_at,
            metadata,
            messages,
            model: None,
            branch: None,
            source_mtime,
        })
    }
}

impl Connector for AntigravityConnector {
    fn name(&self) -> &str {
        "Antigravity"
    }

    fn agent_slug(&self) -> &str {
        "antigravity"
    }

    fn detect(&self) -> DetectionResult {
        let mut root_paths = Vec::new();
        let mut evidence = Vec::new();

        for root in self.default_roots() {
            let mut found = false;

            if Self::has_brain_storage(&root) {
                evidence.push(format!(
                    "Found Antigravity Gemini artifacts at {}",
                    root.display()
                ));
                found = true;
            }

            if Self::has_legacy_storage(&root) {
                evidence.push(format!(
                    "Found Antigravity legacy user data at {}",
                    root.display()
                ));
                found = true;
            }

            if found {
                root_paths.push(root.to_string_lossy().to_string());
            }
        }

        if !root_paths.is_empty() {
            return DetectionResult {
                detected: true,
                root_paths,
                evidence: evidence.join("; "),
            };
        }

        DetectionResult {
            detected: false,
            root_paths: vec![],
            evidence: "No Antigravity storage found".to_string(),
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
            for session_dir in self.collect_brain_session_dirs(&root) {
                let source_mtime = Self::collect_brain_artifact_paths(&session_dir)
                    .iter()
                    .filter_map(|path| Self::path_mtime_rfc3339(path))
                    .max()
                    .or_else(|| Self::path_mtime_rfc3339(&session_dir));

                if let (Some(since), Some(modified)) = (since_ts, source_mtime.as_deref()) {
                    if modified < since {
                        continue;
                    }
                }

                if let Some(conversation) = self.parse_brain_session_dir(&session_dir) {
                    conversations.push(conversation);
                }
            }

            for (session_dir, workspace) in self.collect_legacy_session_dirs(&root) {
                if let Ok(entries) = fs::read_dir(&session_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                            continue;
                        }

                        if let Some(since) = since_ts {
                            if let Ok(metadata) = fs::metadata(&path) {
                                if let Ok(modified) = metadata.modified() {
                                    let modified = chrono::DateTime::<chrono::Utc>::from(modified)
                                        .to_rfc3339();
                                    if modified.as_str() < since {
                                        continue;
                                    }
                                }
                            }
                        }

                        if let Some(conversation) =
                            self.parse_session_file(&path, workspace.clone())
                        {
                            conversations.push(conversation);
                        }
                    }
                }
            }
        }

        conversations
    }
}

fn first_line(text: &str, max_len: usize) -> String {
    let line = text.lines().next().unwrap_or(text);
    if line.len() > max_len {
        format!("{}…", &line[..max_len])
    } else {
        line.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_antigravity_session_json() {
        let connector = AntigravityConnector::new();
        let session = serde_json::json!({
            "sessionId": "session-123",
            "customTitle": "Fix Linux path handling",
            "creationDate": 1710000000000i64,
            "lastMessageDate": 1710000005000i64,
            "responderUsername": "Antigravity",
            "requests": [
                {
                    "message": { "text": "Investigate the storage path" },
                    "response": "Start with the workspaceStorage root.",
                    "userSelectedModelId": "gemini-2.5-pro"
                },
                {
                    "message": "Implement the connector",
                    "response": [
                        { "value": "Added the backend parser." },
                        { "content": "Updated the UI theme." }
                    ]
                }
            ]
        });

        let conversation = connector
            .parse_session_value(
                Path::new("/tmp/session-123.json"),
                &session,
                Some("/workspace/recall".to_string()),
            )
            .expect("expected a parsed conversation");

        assert_eq!(conversation.agent_slug, "antigravity");
        assert_eq!(conversation.external_id, "session-123");
        assert_eq!(conversation.workspace.as_deref(), Some("/workspace/recall"));
        assert_eq!(
            conversation.title.as_deref(),
            Some("Fix Linux path handling")
        );
        assert_eq!(conversation.model.as_deref(), Some("gemini-2.5-pro"));
        assert_eq!(conversation.messages.len(), 4);
        assert_eq!(conversation.messages[0].role, "user");
        assert_eq!(conversation.messages[1].role, "assistant");
        assert_eq!(
            conversation.messages[1].author.as_deref(),
            Some("Antigravity")
        );
        assert!(conversation.messages[3]
            .content
            .contains("Updated the UI theme."));
        assert!(conversation.started_at.is_some());
        assert!(conversation.ended_at.is_some());
    }

    #[test]
    fn read_workspace_folder_decodes_file_uri() {
        let temp_dir =
            std::env::temp_dir().join(format!("recall-antigravity-test-{}", std::process::id()));
        fs::create_dir_all(&temp_dir).expect("create temp workspace dir");
        fs::write(
            temp_dir.join("workspace.json"),
            r#"{"folder":"file:///home/alice/project"}"#,
        )
        .expect("write workspace json");

        let workspace = AntigravityConnector::read_workspace_folder(&temp_dir);
        assert_eq!(workspace.as_deref(), Some("/home/alice/project"));

        let _ = fs::remove_file(temp_dir.join("workspace.json"));
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn parses_antigravity_brain_session_directory() {
        let connector = AntigravityConnector::new();
        let temp_dir = std::env::temp_dir().join(format!(
            "recall-antigravity-brain-test-{}",
            std::process::id()
        ));
        let session_dir = temp_dir.join("brain/session-123");

        fs::create_dir_all(&session_dir).expect("create temp brain session dir");
        fs::write(
            session_dir.join("task.md"),
            "# Investigate missing Antigravity sessions\n\nFigure out why Recall is empty.",
        )
        .expect("write task artifact");
        fs::write(
            session_dir.join("task.md.metadata.json"),
            r#"{"summary":"Investigate missing Antigravity sessions","updatedAt":"2026-04-21T17:40:00Z"}"#,
        )
        .expect("write task metadata");
        fs::write(
            session_dir.join("implementation_plan.md"),
            "Collect the real storage root and compare it with the connector assumptions.",
        )
        .expect("write plan artifact");
        fs::write(
            session_dir.join("implementation_plan.md.metadata.json"),
            r#"{"updatedAt":"2026-04-21T17:41:00Z"}"#,
        )
        .expect("write plan metadata");
        fs::write(
            session_dir.join("walkthrough.md"),
            "Recall now scans the Gemini Antigravity brain directory and surfaces these sessions.",
        )
        .expect("write walkthrough artifact");
        fs::write(
            session_dir.join("walkthrough.md.metadata.json"),
            r#"{"updatedAt":"2026-04-21T17:42:00Z"}"#,
        )
        .expect("write walkthrough metadata");

        let conversation = connector
            .parse_brain_session_dir(&session_dir)
            .expect("expected a parsed brain conversation");

        assert_eq!(conversation.agent_slug, "antigravity");
        assert_eq!(conversation.external_id, "session-123");
        assert_eq!(
            conversation.title.as_deref(),
            Some("# Investigate missing Antigravity sessions")
        );
        assert_eq!(conversation.messages.len(), 3);
        assert_eq!(conversation.messages[0].role, "user");
        assert_eq!(conversation.messages[1].role, "assistant");
        assert_eq!(
            conversation.messages[1].author.as_deref(),
            Some("Antigravity")
        );
        assert_eq!(
            conversation.started_at.as_deref(),
            Some("2026-04-21T17:40:00+00:00")
        );
        assert_eq!(
            conversation.ended_at.as_deref(),
            Some("2026-04-21T17:42:00+00:00")
        );
        assert_eq!(conversation.metadata["storage"], "brain");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
