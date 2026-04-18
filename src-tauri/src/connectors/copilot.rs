use crate::connectors::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};
use std::fs;
use std::path::{Path, PathBuf};

pub struct CopilotConnector;

impl CopilotConnector {
    pub fn new() -> Self { Self }

    /// VS Code stores full Copilot chat sessions in per-workspace storage:
    /// ~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/<session-uuid>.jsonl
    /// These JSONL files use an incremental state format:
    ///   kind=0: initial snapshot (header with sessionId, creationDate, etc.)
    ///   kind=1: set a value at a key path (e.g. ["customTitle"] or ["requests", 0, "response", 5, "value"])
    ///   kind=2: push items to an array at a key path (e.g. ["requests"])
    fn workspace_storage_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        let candidates = if cfg!(target_os = "macos") {
            vec![
                dirs::home_dir().map(|h| h.join("Library/Application Support/Code/User/workspaceStorage")),
                dirs::home_dir().map(|h| h.join("Library/Application Support/Code - Insiders/User/workspaceStorage")),
            ]
        } else {
            vec![
                dirs::home_dir().map(|h| h.join(".config/Code/User/workspaceStorage")),
                dirs::home_dir().map(|h| h.join(".config/Code - Insiders/User/workspaceStorage")),
            ]
        };
        for maybe_path in candidates.into_iter().flatten() {
            if maybe_path.is_dir() {
                roots.push(maybe_path);
            }
        }
        roots
    }

    /// Find all workspace hash directories that have chatSessions
    fn find_workspace_dirs(&self) -> Vec<PathBuf> {
        let mut ws_dirs = Vec::new();
        for ws_root in self.workspace_storage_roots() {
            if let Ok(entries) = fs::read_dir(&ws_root) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.join("chatSessions").is_dir() {
                        ws_dirs.push(path);
                    }
                }
            }
        }
        ws_dirs
    }

    /// Read the workspace.json to get the folder path for context
    fn read_workspace_folder(ws_hash_dir: &Path) -> Option<String> {
        let wj = ws_hash_dir.join("workspace.json");
        let content = fs::read_to_string(wj).ok()?;
        let val: serde_json::Value = serde_json::from_str(&content).ok()?;
        let folder = val.get("folder")?.as_str()?;
        let path = if let Some(stripped) = folder.strip_prefix("file://") {
            urlencoding::decode(stripped).ok()?.to_string()
        } else {
            folder.to_string()
        };
        Some(path)
    }

    /// Convert epoch millis to RFC 3339 string
    fn millis_to_rfc3339(ms: i64) -> String {
        let secs = ms / 1000;
        let nsecs = ((ms % 1000) * 1_000_000) as u32;
        chrono::DateTime::from_timestamp(secs, nsecs)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339())
    }

    /// Extract a clean file path from a VS Code URI JSON string.
    /// The URI can be either a JSON object with a "path" field, or a plain string.
    fn extract_path_from_uri(uri_str: &str) -> String {
        if uri_str.is_empty() { return String::new(); }
        // Try parsing as JSON object first
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(uri_str) {
            if let Some(path) = val.get("path").and_then(|p| p.as_str()) {
                return path.to_string();
            }
            if let Some(fs_path) = val.get("fsPath").and_then(|p| p.as_str()) {
                return fs_path.to_string();
            }
        }
        // Fallback: try as file:// URL
        if let Some(stripped) = uri_str.strip_prefix("file://") {
            return urlencoding::decode(stripped).unwrap_or_default().to_string();
        }
        uri_str.to_string()
    }

    /// Navigate into a nested serde_json::Value by a key path, returning a mutable reference.
    /// Keys can be strings (for objects) or integers (for arrays).
    fn navigate_mut<'a>(root: &'a mut serde_json::Value, keys: &[serde_json::Value]) -> Option<&'a mut serde_json::Value> {
        let mut current = root;
        for key in keys {
            match key {
                serde_json::Value::String(s) => {
                    if !current.is_object() {
                        *current = serde_json::json!({});
                    }
                    current = current.as_object_mut()?.entry(s.clone()).or_insert(serde_json::Value::Null);
                }
                serde_json::Value::Number(n) => {
                    let idx = n.as_u64()? as usize;
                    if !current.is_array() {
                        *current = serde_json::json!([]);
                    }
                    let arr = current.as_array_mut()?;
                    while arr.len() <= idx {
                        arr.push(serde_json::Value::Null);
                    }
                    current = arr.get_mut(idx)?;
                }
                _ => return None,
            }
        }
        Some(current)
    }

    /// Replay a chatSessions JSONL file to reconstruct the full session state.
    /// Returns the reconstructed JSON state object.
    fn replay_jsonl(content: &str) -> Option<serde_json::Value> {
        let mut state: Option<serde_json::Value> = None;

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() { continue; }
            let obj: serde_json::Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let kind = obj.get("kind").and_then(|k| k.as_u64()).unwrap_or(99);

            match kind {
                0 => {
                    // Initial snapshot
                    state = obj.get("v").cloned();
                }
                1 => {
                    // Set value at key path
                    if let (Some(ref mut s), Some(keys), Some(val)) = (
                        state.as_mut(),
                        obj.get("k").and_then(|k| k.as_array()),
                        obj.get("v"),
                    ) {
                        if keys.is_empty() { continue; }
                        let parent_keys = &keys[..keys.len() - 1];
                        let last_key = &keys[keys.len() - 1];
                        if let Some(parent) = Self::navigate_mut(s, parent_keys) {
                            match last_key {
                                serde_json::Value::String(s_key) => {
                                    if let Some(obj_map) = parent.as_object_mut() {
                                        obj_map.insert(s_key.clone(), val.clone());
                                    }
                                }
                                serde_json::Value::Number(n) => {
                                    if let Some(idx) = n.as_u64() {
                                        let idx = idx as usize;
                                        if let Some(arr) = parent.as_array_mut() {
                                            while arr.len() <= idx {
                                                arr.push(serde_json::Value::Null);
                                            }
                                            arr[idx] = val.clone();
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
                2 => {
                    // Push to array at key path
                    if let (Some(ref mut s), Some(keys), Some(items)) = (
                        state.as_mut(),
                        obj.get("k").and_then(|k| k.as_array()),
                        obj.get("v").and_then(|v| v.as_array()),
                    ) {
                        if let Some(target) = Self::navigate_mut(s, keys) {
                            if !target.is_array() {
                                *target = serde_json::json!([]);
                            }
                            if let Some(arr) = target.as_array_mut() {
                                arr.extend(items.iter().cloned());
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        state
    }

    /// Parse a chatSessions JSONL file into a NormalizedConversation.
    fn parse_chat_session(&self, path: &Path, workspace_folder: Option<String>) -> Option<NormalizedConversation> {
        let content = fs::read_to_string(path).ok()?;
        let state = Self::replay_jsonl(&content)?;

        let session_id = state.get("sessionId")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| path.file_stem().unwrap_or_default().to_string_lossy().to_string());

        let creation_date = state.get("creationDate").and_then(|d| d.as_i64());
        let custom_title = state.get("customTitle").and_then(|t| t.as_str()).map(|s| s.to_string());

        let requests = match state.get("requests").and_then(|r| r.as_array()) {
            Some(r) => r,
            None => return None,
        };
        if requests.is_empty() { return None; }

        let mut messages: Vec<NormalizedMessage> = Vec::new();
        let mut first_model: Option<String> = None;
        let mut first_user_text: Option<String> = None;
        let mut last_timestamp: Option<i64> = None;

        for req in requests {
            // Extract user message
            let user_text = req.get("message")
                .and_then(|m| m.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            let timestamp = req.get("timestamp").and_then(|t| t.as_i64());

            if let Some(ts) = timestamp {
                last_timestamp = Some(ts);
            }

            if !user_text.is_empty() {
                if first_user_text.is_none() {
                    first_user_text = Some(user_text.to_string());
                }
                messages.push(NormalizedMessage {
                    idx: messages.len(),
                    role: "user".to_string(),
                    author: None,
                    created_at: timestamp.map(Self::millis_to_rfc3339),
                    content: user_text.to_string(),
                    extra: serde_json::json!({}),
                });
            }

            // Extract model
            if first_model.is_none() {
                first_model = req.get("modelId")
                    .and_then(|m| m.as_str())
                    .map(|s| s.strip_prefix("copilot/").unwrap_or(s).to_string());
            }

            // Extract assistant response - collect structured parts for rich rendering
            if let Some(resp_parts) = req.get("response").and_then(|r| r.as_array()) {
                let mut plain_text: Vec<String> = Vec::new();
                let mut structured_parts: Vec<serde_json::Value> = Vec::new();

                for part in resp_parts {
                    let part_kind = part.get("kind").and_then(|k| k.as_str());
                    match part_kind {
                        // No kind = plain text/markdown content
                        None => {
                            if let Some(val) = part.get("value").and_then(|v| v.as_str()) {
                                if !val.is_empty() {
                                    plain_text.push(val.to_string());
                                    structured_parts.push(serde_json::json!({
                                        "type": "text",
                                        "content": val,
                                    }));
                                }
                            }
                        }
                        // Thinking/reasoning blocks
                        Some("thinking") => {
                            if let Some(val) = part.get("value").and_then(|v| v.as_str()) {
                                if !val.trim().is_empty() {
                                    let title = part.get("generatedTitle")
                                        .and_then(|t| t.as_str())
                                        .unwrap_or("Thinking…");
                                    structured_parts.push(serde_json::json!({
                                        "type": "thinking",
                                        "content": val,
                                        "title": title,
                                    }));
                                    // Don't add to plain_text — it clutters the content
                                }
                            }
                        }
                        // Tool invocations (sub-agents, file reads, searches, etc.)
                        Some("toolInvocationSerialized") => {
                            let tool_id = part.get("toolId")
                                .and_then(|t| t.as_str())
                                .unwrap_or("unknown");
                            let message = part.get("invocationMessage")
                                .and_then(|m| m.as_str())
                                .unwrap_or("");
                            let is_complete = part.get("isComplete")
                                .and_then(|c| c.as_bool())
                                .unwrap_or(false);
                            let mut tool_data = serde_json::json!({
                                "type": "tool_call",
                                "tool": tool_id,
                                "message": message,
                                "complete": is_complete,
                            });
                            // Try to extract result from toolSpecificData
                            if let Some(tsd) = part.get("toolSpecificData").and_then(|d| d.as_str()) {
                                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(tsd) {
                                    if let Some(desc) = parsed.get("description").and_then(|d| d.as_str()) {
                                        tool_data["description"] = serde_json::json!(desc);
                                    }
                                }
                            }
                            structured_parts.push(tool_data);
                        }
                        // Code edit groups (file creation/edits)
                        Some("textEditGroup") => {
                            let uri_str = part.get("uri").and_then(|u| u.as_str()).unwrap_or("");
                            let file_path = Self::extract_path_from_uri(uri_str);
                            let edits_str = part.get("edits").and_then(|e| e.as_str()).unwrap_or("[]");
                            let is_done = part.get("done").and_then(|d| d.as_bool()).unwrap_or(false);

                            // Parse edits JSON — it's a nested array: [[{text, range}], ...]
                            let mut edit_text = String::new();
                            if let Ok(edits_arr) = serde_json::from_str::<serde_json::Value>(edits_str) {
                                if let Some(outer) = edits_arr.as_array() {
                                    for group in outer {
                                        if let Some(inner) = group.as_array() {
                                            for edit in inner {
                                                if let Some(text) = edit.get("text").and_then(|t| t.as_str()) {
                                                    edit_text.push_str(text);
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if !edit_text.is_empty() || !file_path.is_empty() {
                                structured_parts.push(serde_json::json!({
                                    "type": "text_edit",
                                    "file_path": file_path,
                                    "content": edit_text,
                                    "done": is_done,
                                }));
                            }
                        }
                        // Code block URI markers (file context before code blocks)
                        Some("codeblockUri") => {
                            let uri_path = part.get("uri")
                                .and_then(|u| u.get("path"))
                                .and_then(|p| p.as_str())
                                .unwrap_or("");
                            let is_edit = part.get("isEdit").and_then(|e| e.as_bool()).unwrap_or(false);
                            if !uri_path.is_empty() {
                                let ref_kind = if is_edit { "file_edit" } else { "file" };
                                structured_parts.push(serde_json::json!({
                                    "type": "reference",
                                    "name": Self::extract_path_from_uri(uri_path),
                                    "uri": uri_path,
                                    "ref_kind": ref_kind,
                                }));
                            }
                        }
                        // Progress tasks (compacting, searching, etc.)
                        Some("progressTaskSerialized") => {
                            if let Some(content) = part.get("content")
                                .and_then(|c| c.get("value"))
                                .and_then(|v| v.as_str())
                            {
                                if !content.is_empty() {
                                    structured_parts.push(serde_json::json!({
                                        "type": "progress",
                                        "content": content,
                                    }));
                                }
                            }
                        }
                        // Inline file/folder references
                        Some("inlineReference") => {
                            if let Some(ref_val) = part.get("inlineReference") {
                                let name = ref_val.get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("");
                                let uri_path = ref_val.get("location")
                                    .and_then(|l| l.get("uri"))
                                    .and_then(|u| u.get("path"))
                                    .and_then(|p| p.as_str())
                                    .unwrap_or("");
                                if !name.is_empty() {
                                    structured_parts.push(serde_json::json!({
                                        "type": "reference",
                                        "name": name,
                                        "uri": uri_path,
                                        "ref_kind": "symbol",
                                    }));
                                }
                            }
                        }
                        // undoStop, questionCarousel, etc. — skip
                        _ => {}
                    }
                }

                let response_text = plain_text.join("");
                // Only create message if there's actual content (text or structured)
                let has_content = !response_text.trim().is_empty() || 
                    structured_parts.iter().any(|p| {
                        let t = p.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        t == "thinking" || t == "tool_call" || t == "text_edit"
                    });

                if has_content {
                    messages.push(NormalizedMessage {
                        idx: messages.len(),
                        role: "assistant".to_string(),
                        author: Some("Copilot".to_string()),
                        created_at: timestamp.map(Self::millis_to_rfc3339),
                        content: response_text,
                        extra: serde_json::json!({ "parts": structured_parts }),
                    });
                }
            }
        }

        if messages.is_empty() { return None; }

        // Title: prefer customTitle, then first user message truncated
        let title = custom_title.or_else(|| {
            first_user_text.map(|t| {
                let truncated: String = t.chars().take(100).collect();
                if truncated.len() < t.len() {
                    format!("{}…", truncated)
                } else {
                    truncated
                }
            })
        });

        let started_at = creation_date.map(Self::millis_to_rfc3339);
        let ended_at = last_timestamp.map(Self::millis_to_rfc3339)
            .or_else(|| started_at.clone());

        let file_mtime = fs::metadata(path).ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());

        Some(NormalizedConversation {
            agent_slug: "copilot".to_string(),
            external_id: session_id,
            title,
            workspace: workspace_folder,
            source_path: path.to_string_lossy().to_string(),
            started_at: started_at.or(file_mtime.clone()),
            ended_at: ended_at.or(file_mtime.clone()),
            metadata: serde_json::json!({}),
            messages,
            model: first_model,
            branch: None,
            source_mtime: file_mtime,
        })
    }
}

impl Connector for CopilotConnector {
    fn name(&self) -> &str { "GitHub Copilot" }
    fn agent_slug(&self) -> &str { "copilot" }

    fn detect(&self) -> DetectionResult {
        let ws_dirs = self.find_workspace_dirs();
        if !ws_dirs.is_empty() {
            DetectionResult {
                detected: true,
                root_paths: ws_dirs.iter().map(|p| p.to_string_lossy().to_string()).collect(),
                evidence: format!("Found {} workspace(s) with Copilot Chat sessions", ws_dirs.len()),
            }
        } else {
            DetectionResult {
                detected: false,
                root_paths: vec![],
                evidence: "No Copilot Chat sessions found in VS Code workspaceStorage".to_string(),
            }
        }
    }

    fn scan(&self, _roots: &[String], since_ts: Option<&str>) -> Vec<NormalizedConversation> {
        let mut conversations = Vec::new();

        for ws_root in self.workspace_storage_roots() {
            if let Ok(entries) = fs::read_dir(&ws_root) {
                for entry in entries.flatten() {
                    let ws_hash_dir = entry.path();
                    let chat_sessions_dir = ws_hash_dir.join("chatSessions");
                    if !chat_sessions_dir.is_dir() { continue; }

                    let workspace_folder = Self::read_workspace_folder(&ws_hash_dir);

                    if let Ok(files) = fs::read_dir(&chat_sessions_dir) {
                        for file_entry in files.flatten() {
                            let path = file_entry.path();
                            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") { continue; }
                            if !path.is_file() { continue; }

                            // Filter by mtime
                            if let Some(since) = since_ts {
                                if let Ok(meta) = fs::metadata(&path) {
                                    if let Ok(mtime) = meta.modified() {
                                        let mtime_str = chrono::DateTime::<chrono::Utc>::from(mtime).to_rfc3339();
                                        if mtime_str.as_str() < since { continue; }
                                    }
                                }
                            }

                            if let Some(conv) = self.parse_chat_session(&path, workspace_folder.clone()) {
                                conversations.push(conv);
                            }
                        }
                    }
                }
            }
        }

        conversations
    }
}
