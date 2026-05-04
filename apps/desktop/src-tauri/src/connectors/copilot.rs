use crate::connectors::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};
use similar::TextDiff;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub struct CopilotConnector;

#[derive(Debug, Clone)]
struct EditOperation {
    epoch: i64,
    index: usize,
    kind: EditOperationKind,
}

#[derive(Debug, Clone)]
enum EditOperationKind {
    Create { initial_content: String },
    Delete { final_content: String },
    TextEdit { edits: Vec<serde_json::Value> },
}

#[derive(Debug, Default)]
struct EditSessionData {
    request_parts: HashMap<String, Vec<serde_json::Value>>,
    source_mtime: Option<String>,
}

impl CopilotConnector {
    pub fn new() -> Self {
        Self
    }

    /// VS Code stores full Copilot chat sessions in per-workspace storage:
    /// - macOS: ~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/<session-uuid>.jsonl
    /// - Linux: ~/.config/Code/User/workspaceStorage/<hash>/chatSessions/<session-uuid>.jsonl
    /// - Windows: %APPDATA%\Code\User\workspaceStorage\<hash>\chatSessions\<session-uuid>.jsonl
    ///
    /// These JSONL files use an incremental state format:
    ///   kind=0: initial snapshot (header with sessionId, creationDate, etc.)
    ///   kind=1: set a value at a key path (e.g. ["customTitle"] or ["requests", 0, "response", 5, "value"])
    ///   kind=2: push items to an array at a key path (e.g. ["requests"])
    fn workspace_storage_roots(&self) -> Vec<PathBuf> {
        let mut roots = Vec::new();
        let candidates = if cfg!(target_os = "macos") {
            vec![
                dirs::home_dir()
                    .map(|h| h.join("Library/Application Support/Code/User/workspaceStorage")),
                dirs::home_dir().map(|h| {
                    h.join("Library/Application Support/Code - Insiders/User/workspaceStorage")
                }),
            ]
        } else if cfg!(target_os = "windows") {
            vec![
                dirs::config_dir().map(|d| d.join("Code/User/workspaceStorage")),
                dirs::config_dir().map(|d| d.join("Code - Insiders/User/workspaceStorage")),
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

    /// Collect workspace hash directories from a scan root. The root can be
    /// either the workspaceStorage directory or a single workspace hash path.
    fn workspace_dirs_from_scan_root(scan_root: &Path) -> Vec<PathBuf> {
        if scan_root.join("chatSessions").is_dir() {
            return vec![scan_root.to_path_buf()];
        }

        let mut ws_dirs = Vec::new();
        if let Ok(entries) = fs::read_dir(scan_root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.join("chatSessions").is_dir() {
                    ws_dirs.push(path);
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
            Self::normalize_file_uri_path(&urlencoding::decode(stripped).ok()?)
        } else {
            folder.to_string()
        };
        Some(path)
    }

    /// Normalize a decoded file:// path for the current OS. On Windows, VS Code
    /// emits URIs like `file:///C:/...` which decode to `/C:/...`; we strip the
    /// leading slash so we end up with `C:/...`. No-op elsewhere.
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
        if uri_str.is_empty() {
            return String::new();
        }
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
            let decoded = urlencoding::decode(stripped)
                .unwrap_or_default()
                .to_string();
            return Self::normalize_file_uri_path(&decoded);
        }
        uri_str.to_string()
    }

    fn extract_path_from_value(value: &serde_json::Value) -> String {
        if let Some(path) = value.get("path").and_then(|p| p.as_str()) {
            return path.to_string();
        }
        if let Some(fs_path) = value.get("fsPath").and_then(|p| p.as_str()) {
            return fs_path.to_string();
        }
        if let Some(external) = value.get("external").and_then(|p| p.as_str()) {
            return Self::extract_path_from_uri(external);
        }
        value
            .as_str()
            .map(Self::extract_path_from_uri)
            .unwrap_or_default()
    }

    fn extract_display_text(value: &serde_json::Value) -> Option<String> {
        match value {
            serde_json::Value::String(text) => {
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }
            serde_json::Value::Number(number) => Some(number.to_string()),
            serde_json::Value::Bool(boolean) => Some(boolean.to_string()),
            serde_json::Value::Array(items) => {
                let joined = items
                    .iter()
                    .filter_map(Self::extract_display_text)
                    .collect::<Vec<_>>()
                    .join(" ");
                if joined.is_empty() {
                    None
                } else {
                    Some(joined)
                }
            }
            serde_json::Value::Object(_) => {
                for key in [
                    "value",
                    "title",
                    "label",
                    "name",
                    "message",
                    "description",
                    "content",
                    "original",
                ] {
                    if let Some(text) = value.get(key).and_then(Self::extract_display_text) {
                        return Some(text);
                    }
                }

                if let Some(parts) = value.get("parts").and_then(|parts| parts.as_array()) {
                    let joined = parts
                        .iter()
                        .filter_map(Self::extract_display_text)
                        .collect::<Vec<_>>()
                        .join(" ");
                    if !joined.is_empty() {
                        return Some(joined);
                    }
                }

                None
            }
            _ => None,
        }
    }

    fn extract_content_text(value: &serde_json::Value) -> Option<String> {
        match value {
            serde_json::Value::String(text) => Some(text.clone()),
            _ => Self::extract_display_text(value),
        }
    }

    fn extract_tool_description(part: &serde_json::Value) -> Option<String> {
        let tool_data = part.get("toolSpecificData")?;
        let parsed = match tool_data {
            serde_json::Value::String(raw) => serde_json::from_str::<serde_json::Value>(raw)
                .unwrap_or_else(|_| serde_json::Value::String(raw.clone())),
            serde_json::Value::Object(_) | serde_json::Value::Array(_) => tool_data.clone(),
            _ => return None,
        };

        for key in [
            "description",
            "progressMessage",
            "message",
            "content",
            "commandLine",
        ] {
            if let Some(text) = parsed.get(key).and_then(Self::extract_display_text) {
                return Some(text);
            }
        }

        Self::extract_display_text(&parsed)
    }

    fn edit_session_state_path(chat_session_path: &Path, session_id: &str) -> PathBuf {
        chat_session_path
            .parent()
            .and_then(Path::parent)
            .unwrap_or(chat_session_path)
            .join("chatEditingSessions")
            .join(session_id)
            .join("state.json")
    }

    fn path_mtime_rfc3339(path: &Path) -> Option<String> {
        fs::metadata(path)
            .ok()
            .and_then(|meta| meta.modified().ok())
            .map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339())
    }

    fn latest_session_source_mtime(chat_session_path: &Path) -> Option<String> {
        let mut mtimes = Vec::new();

        if let Some(chat_mtime) = Self::path_mtime_rfc3339(chat_session_path) {
            mtimes.push(chat_mtime);
        }

        if let Some(session_id) = chat_session_path.file_stem().and_then(|stem| stem.to_str()) {
            let edit_state_path = Self::edit_session_state_path(chat_session_path, session_id);
            if let Some(edit_mtime) = Self::path_mtime_rfc3339(&edit_state_path) {
                mtimes.push(edit_mtime);
            }
        }

        mtimes.into_iter().max()
    }

    fn collect_file_baselines(state: &serde_json::Value) -> HashMap<(String, String), String> {
        let mut baselines = HashMap::new();

        let Some(file_baselines) = state
            .get("timeline")
            .and_then(|timeline| timeline.get("fileBaselines"))
        else {
            return baselines;
        };

        let baseline_values: Vec<&serde_json::Value> = match file_baselines {
            serde_json::Value::Object(entries) => entries.values().collect(),
            serde_json::Value::Array(entries) => entries.iter().collect(),
            _ => Vec::new(),
        };

        for entry in baseline_values {
            let baseline = match entry {
                serde_json::Value::Array(items) if items.len() >= 2 => &items[1],
                _ => entry,
            };

            let Some(request_id) = baseline.get("requestId").and_then(|value| value.as_str())
            else {
                continue;
            };

            let path = baseline
                .get("uri")
                .map(Self::extract_path_from_value)
                .unwrap_or_default();
            let content = baseline
                .get("content")
                .and_then(|value| value.as_str())
                .unwrap_or("");

            if !path.is_empty() {
                baselines.insert((request_id.to_string(), path), content.to_string());
            }
        }

        baselines
    }

    fn byte_index_for_char_offset(line: &str, char_offset: usize) -> usize {
        if char_offset == 0 {
            return 0;
        }

        for (index, (byte_offset, _)) in line.char_indices().enumerate() {
            if index == char_offset {
                return byte_offset;
            }
        }

        line.len()
    }

    fn byte_index_for_position(content: &str, line_number: usize, column: usize) -> usize {
        let target_line = line_number.max(1);
        let target_column = column.max(1);

        let mut current_line = 1;
        let mut line_start = 0usize;

        if target_line > 1 {
            for (byte_offset, character) in content.char_indices() {
                if character == '\n' {
                    current_line += 1;
                    line_start = byte_offset + character.len_utf8();
                    if current_line == target_line {
                        break;
                    }
                }
            }
        }

        if current_line != target_line {
            return content.len();
        }

        let rest = &content[line_start..];
        let line_end = rest.find('\n').unwrap_or(rest.len());
        let line_slice = &rest[..line_end];

        line_start + Self::byte_index_for_char_offset(line_slice, target_column.saturating_sub(1))
    }

    fn apply_text_edits(content: &str, edits: &[serde_json::Value]) -> String {
        let mut replacements: Vec<(usize, usize, String)> = Vec::new();

        for edit in edits {
            let replacement = edit
                .get("text")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();

            let Some(range) = edit.get("range") else {
                return replacement;
            };

            let start_line = range
                .get("startLineNumber")
                .and_then(|value| value.as_u64())
                .unwrap_or(1) as usize;
            let start_column = range
                .get("startColumn")
                .and_then(|value| value.as_u64())
                .unwrap_or(1) as usize;
            let end_line = range
                .get("endLineNumber")
                .and_then(|value| value.as_u64())
                .unwrap_or(start_line as u64) as usize;
            let end_column = range
                .get("endColumn")
                .and_then(|value| value.as_u64())
                .unwrap_or(start_column as u64) as usize;

            let start = Self::byte_index_for_position(content, start_line, start_column);
            let end = Self::byte_index_for_position(content, end_line, end_column);
            replacements.push((
                start.min(content.len()),
                end.min(content.len()),
                replacement,
            ));
        }

        replacements.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| right.1.cmp(&left.1)));

        let mut next = content.to_string();
        for (start, end, replacement) in replacements {
            let start = start.min(next.len());
            let end = end.min(next.len()).max(start);
            next.replace_range(start..end, &replacement);
        }

        next
    }

    fn build_unified_diff(file_path: &str, before: &str, after: &str) -> String {
        let old_label = if before.is_empty() && !after.is_empty() {
            "/dev/null".to_string()
        } else {
            format!("a/{}", file_path)
        };
        let new_label = if !before.is_empty() && after.is_empty() {
            "/dev/null".to_string()
        } else {
            format!("b/{}", file_path)
        };

        TextDiff::from_lines(before, after)
            .unified_diff()
            .header(&old_label, &new_label)
            .to_string()
    }

    fn collect_request_edit_parts(
        state: &serde_json::Value,
    ) -> HashMap<String, Vec<serde_json::Value>> {
        let baselines = Self::collect_file_baselines(state);
        let mut grouped: HashMap<String, HashMap<String, Vec<EditOperation>>> = HashMap::new();

        let Some(operations) = state
            .get("timeline")
            .and_then(|timeline| timeline.get("operations"))
            .and_then(|operations| operations.as_array())
        else {
            return HashMap::new();
        };

        for (index, operation) in operations.iter().enumerate() {
            let Some(request_id) = operation.get("requestId").and_then(|value| value.as_str())
            else {
                continue;
            };

            let path = operation
                .get("uri")
                .map(Self::extract_path_from_value)
                .unwrap_or_default();
            if path.is_empty() {
                continue;
            }

            let epoch = operation
                .get("epoch")
                .and_then(|value| value.as_i64())
                .unwrap_or(index as i64);

            let kind = match operation.get("type").and_then(|value| value.as_str()) {
                Some("create") => EditOperationKind::Create {
                    initial_content: operation
                        .get("initialContent")
                        .and_then(|value| value.as_str())
                        .unwrap_or("")
                        .to_string(),
                },
                Some("delete") => EditOperationKind::Delete {
                    final_content: operation
                        .get("finalContent")
                        .and_then(|value| value.as_str())
                        .unwrap_or("")
                        .to_string(),
                },
                Some("textEdit") => EditOperationKind::TextEdit {
                    edits: operation
                        .get("edits")
                        .and_then(|value| value.as_array())
                        .cloned()
                        .unwrap_or_default(),
                },
                _ => continue,
            };

            grouped
                .entry(request_id.to_string())
                .or_default()
                .entry(path)
                .or_default()
                .push(EditOperation { epoch, index, kind });
        }

        let mut request_parts = HashMap::new();

        for (request_id, files) in grouped {
            let mut file_entries: Vec<_> = files.into_iter().collect();
            file_entries.sort_by(|left, right| left.0.cmp(&right.0));

            let mut parts = Vec::new();
            for (file_path, mut operations) in file_entries {
                operations.sort_by_key(|operation| (operation.epoch, operation.index));

                let mut before = baselines
                    .get(&(request_id.clone(), file_path.clone()))
                    .cloned()
                    .unwrap_or_default();

                if before.is_empty() {
                    if let Some(first) = operations.first() {
                        before = match &first.kind {
                            EditOperationKind::Create { initial_content } => {
                                initial_content.clone()
                            }
                            EditOperationKind::Delete { final_content } => final_content.clone(),
                            EditOperationKind::TextEdit { .. } => String::new(),
                        };
                    }
                }

                let original = before.clone();
                let mut current = before;

                for operation in &operations {
                    match &operation.kind {
                        EditOperationKind::Create { initial_content } => {
                            current = initial_content.clone();
                        }
                        EditOperationKind::Delete { .. } => {
                            current.clear();
                        }
                        EditOperationKind::TextEdit { edits } => {
                            current = Self::apply_text_edits(&current, edits);
                        }
                    }
                }

                if original == current {
                    continue;
                }

                let change_kind = if original.is_empty() && !current.is_empty() {
                    "create"
                } else if !original.is_empty() && current.is_empty() {
                    "delete"
                } else {
                    "edit"
                };

                parts.push(serde_json::json!({
                    "type": "text_edit",
                    "file_path": file_path,
                    "content": current,
                    "diff": Self::build_unified_diff(&file_path, &original, &current),
                    "change_kind": change_kind,
                    "done": true,
                }));
            }

            if !parts.is_empty() {
                request_parts.insert(request_id, parts);
            }
        }

        request_parts
    }

    fn load_edit_session_data(chat_session_path: &Path, session_id: &str) -> EditSessionData {
        let state_path = Self::edit_session_state_path(chat_session_path, session_id);
        let source_mtime = Self::path_mtime_rfc3339(&state_path);

        let Some(content) = fs::read_to_string(&state_path).ok() else {
            return EditSessionData {
                request_parts: HashMap::new(),
                source_mtime,
            };
        };

        let Some(state) = serde_json::from_str::<serde_json::Value>(&content).ok() else {
            return EditSessionData {
                request_parts: HashMap::new(),
                source_mtime,
            };
        };

        EditSessionData {
            request_parts: Self::collect_request_edit_parts(&state),
            source_mtime,
        }
    }

    /// Navigate into a nested serde_json::Value by a key path, returning a mutable reference.
    /// Keys can be strings (for objects) or integers (for arrays).
    fn navigate_mut<'a>(
        root: &'a mut serde_json::Value,
        keys: &[serde_json::Value],
    ) -> Option<&'a mut serde_json::Value> {
        let mut current = root;
        for key in keys {
            match key {
                serde_json::Value::String(s) => {
                    if !current.is_object() {
                        *current = serde_json::json!({});
                    }
                    current = current
                        .as_object_mut()?
                        .entry(s.clone())
                        .or_insert(serde_json::Value::Null);
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
            if line.is_empty() {
                continue;
            }
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
                        if keys.is_empty() {
                            continue;
                        }
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
    fn parse_chat_session(
        &self,
        path: &Path,
        workspace_folder: Option<String>,
    ) -> Option<NormalizedConversation> {
        let content = fs::read_to_string(path).ok()?;
        let state = Self::replay_jsonl(&content)?;

        let session_id = state
            .get("sessionId")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string()
            });
        let edit_session_data = Self::load_edit_session_data(path, &session_id);

        let creation_date = state.get("creationDate").and_then(|d| d.as_i64());
        let custom_title = state
            .get("customTitle")
            .and_then(|t| t.as_str())
            .map(|s| s.to_string());

        let requests = state.get("requests").and_then(|r| r.as_array())?;
        if requests.is_empty() {
            return None;
        }

        let mut messages: Vec<NormalizedMessage> = Vec::new();
        let mut first_model: Option<String> = None;
        let mut first_user_text: Option<String> = None;
        let mut last_timestamp: Option<i64> = None;

        for req in requests {
            let request_id = req.get("requestId").and_then(|value| value.as_str());
            // Extract user message
            let user_text = req
                .get("message")
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
                first_model = req
                    .get("modelId")
                    .and_then(|m| m.as_str())
                    .map(|s| s.strip_prefix("copilot/").unwrap_or(s).to_string());
            }

            // Extract assistant response - collect structured parts for rich rendering
            if let Some(resp_parts) = req.get("response").and_then(|r| r.as_array()) {
                let mut plain_text: Vec<String> = Vec::new();
                let mut structured_parts: Vec<serde_json::Value> = Vec::new();
                let mut fallback_edit_parts: Vec<serde_json::Value> = Vec::new();

                for part in resp_parts {
                    let part_kind = part.get("kind").and_then(|k| k.as_str());
                    match part_kind {
                        // No kind = plain text/markdown content
                        None => {
                            if let Some(val) =
                                part.get("value").and_then(Self::extract_content_text)
                            {
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
                            if let Some(val) =
                                part.get("value").and_then(Self::extract_content_text)
                            {
                                if !val.trim().is_empty() {
                                    let title = part
                                        .get("generatedTitle")
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
                            let tool_id = part
                                .get("toolId")
                                .and_then(|t| t.as_str())
                                .unwrap_or("unknown");
                            let message = part
                                .get("invocationMessage")
                                .and_then(Self::extract_display_text)
                                .unwrap_or_default();
                            let is_complete = part
                                .get("isComplete")
                                .and_then(|c| c.as_bool())
                                .unwrap_or(false);
                            let mut tool_data = serde_json::json!({
                                "type": "tool_call",
                                "tool": tool_id,
                                "message": message,
                                "complete": is_complete,
                            });
                            if let Some(description) = Self::extract_tool_description(part) {
                                tool_data["description"] = serde_json::json!(description);
                            }
                            structured_parts.push(tool_data);
                        }
                        // Code edit groups (file creation/edits)
                        Some("textEditGroup") => {
                            let uri_str = part.get("uri").and_then(|u| u.as_str()).unwrap_or("");
                            let file_path = Self::extract_path_from_uri(uri_str);
                            let edits_str =
                                part.get("edits").and_then(|e| e.as_str()).unwrap_or("[]");
                            let is_done =
                                part.get("done").and_then(|d| d.as_bool()).unwrap_or(false);

                            // Parse edits JSON — it's a nested array: [[{text, range}], ...]
                            let mut edit_text = String::new();
                            if let Ok(edits_arr) =
                                serde_json::from_str::<serde_json::Value>(edits_str)
                            {
                                if let Some(outer) = edits_arr.as_array() {
                                    for group in outer {
                                        if let Some(inner) = group.as_array() {
                                            for edit in inner {
                                                if let Some(text) =
                                                    edit.get("text").and_then(|t| t.as_str())
                                                {
                                                    edit_text.push_str(text);
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if !edit_text.is_empty() || !file_path.is_empty() {
                                fallback_edit_parts.push(serde_json::json!({
                                    "type": "text_edit",
                                    "file_path": file_path,
                                    "content": edit_text,
                                    "done": is_done,
                                }));
                            }
                        }
                        // Code block URI markers — noise in history view, skip
                        Some("codeblockUri") => {}
                        // Progress tasks — ephemeral status, skip
                        Some("progressTaskSerialized") => {}
                        // Inline file/folder references
                        Some("inlineReference") => {
                            if let Some(ref_val) = part.get("inlineReference") {
                                let name =
                                    ref_val.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                let uri_path = ref_val
                                    .get("location")
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

                if let Some(edit_parts) =
                    request_id.and_then(|id| edit_session_data.request_parts.get(id))
                {
                    structured_parts.extend(edit_parts.iter().cloned());
                } else {
                    structured_parts.extend(fallback_edit_parts);
                }

                let response_text = plain_text.join("");
                // Only create message if there's actual content (text or structured)
                let has_content = !response_text.trim().is_empty()
                    || structured_parts.iter().any(|p| {
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

        if messages.is_empty() {
            return None;
        }

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
        let ended_at = last_timestamp
            .map(Self::millis_to_rfc3339)
            .or_else(|| started_at.clone());

        let file_mtime = match (
            Self::path_mtime_rfc3339(path),
            edit_session_data.source_mtime.clone(),
        ) {
            (Some(chat_mtime), Some(edit_mtime)) => Some(chat_mtime.max(edit_mtime)),
            (Some(chat_mtime), None) => Some(chat_mtime),
            (None, Some(edit_mtime)) => Some(edit_mtime),
            (None, None) => None,
        };

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
    fn name(&self) -> &str {
        "GitHub Copilot"
    }
    fn agent_slug(&self) -> &str {
        "copilot"
    }

    fn detect(&self) -> DetectionResult {
        let ws_dirs = self.find_workspace_dirs();
        if !ws_dirs.is_empty() {
            DetectionResult {
                detected: true,
                root_paths: ws_dirs
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect(),
                evidence: format!(
                    "Found {} workspace(s) with Copilot Chat sessions",
                    ws_dirs.len()
                ),
            }
        } else {
            DetectionResult {
                detected: false,
                root_paths: vec![],
                evidence: "No Copilot Chat sessions found in VS Code workspaceStorage".to_string(),
            }
        }
    }

    fn scan(&self, roots: &[String], since_ts: Option<&str>) -> Vec<NormalizedConversation> {
        let mut conversations = Vec::new();

        let scan_roots: Vec<PathBuf> = if roots.is_empty() {
            self.workspace_storage_roots()
        } else {
            roots.iter().map(PathBuf::from).collect()
        };

        for ws_root in scan_roots {
            for ws_hash_dir in Self::workspace_dirs_from_scan_root(&ws_root) {
                let chat_sessions_dir = ws_hash_dir.join("chatSessions");
                let workspace_folder = Self::read_workspace_folder(&ws_hash_dir);

                if let Ok(files) = fs::read_dir(&chat_sessions_dir) {
                    for file_entry in files.flatten() {
                        let path = file_entry.path();
                        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                            continue;
                        }
                        if !path.is_file() {
                            continue;
                        }

                        // Filter by mtime
                        if let Some(since) = since_ts {
                            if let Some(mtime_str) = Self::latest_session_source_mtime(&path) {
                                if mtime_str.as_str() < since {
                                    continue;
                                }
                            }
                        }

                        if let Some(conv) = self.parse_chat_session(&path, workspace_folder.clone())
                        {
                            conversations.push(conv);
                        }
                    }
                }
            }
        }

        conversations
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn normalize_posix_file_uri_path_is_unchanged() {
        assert_eq!(
            CopilotConnector::normalize_file_uri_path("/home/user/project"),
            "/home/user/project"
        );
    }

    #[test]
    fn normalize_windows_file_uri_strips_leading_slash() {
        assert_eq!(
            CopilotConnector::normalize_file_uri_path("/C:/Users/alice/project"),
            "C:/Users/alice/project"
        );
    }

    #[test]
    fn normalize_windows_file_uri_handles_lowercase_drive() {
        assert_eq!(
            CopilotConnector::normalize_file_uri_path("/d:/work"),
            "d:/work"
        );
    }

    #[test]
    fn scan_respects_explicit_workspace_storage_roots() {
        let temp_dir =
            std::env::temp_dir().join(format!("recall-copilot-scan-test-{}", uuid::Uuid::new_v4()));
        let workspace_storage = temp_dir.join("workspaceStorage");
        let workspace_dir = workspace_storage.join("workspace-1");
        let chat_sessions_dir = workspace_dir.join("chatSessions");

        fs::create_dir_all(&chat_sessions_dir).expect("create chat sessions dir");
        fs::write(
            workspace_dir.join("workspace.json"),
            r#"{"folder":"file:///tmp/project"}"#,
        )
        .expect("write workspace json");
        fs::write(
            chat_sessions_dir.join("session-1.jsonl"),
            concat!(
                "{\"kind\":0,\"v\":{",
                "\"sessionId\":\"session-1\",",
                "\"creationDate\":1710000000000,",
                "\"customTitle\":\"Fix Copilot scan roots\",",
                "\"requests\":[{",
                "\"message\":{\"text\":\"Inspect the workspace storage root\"},",
                "\"timestamp\":1710000001000,",
                "\"modelId\":\"copilot/gpt-5.4\",",
                "\"response\":[{\"value\":\"Scanning explicit roots now.\"}]",
                "}]}}\n"
            ),
        )
        .expect("write chat session");

        let conversations =
            CopilotConnector::new().scan(&[workspace_storage.to_string_lossy().to_string()], None);

        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0].agent_slug, "copilot");
        assert_eq!(conversations[0].external_id, "session-1");
        assert_eq!(conversations[0].workspace.as_deref(), Some("/tmp/project"));
        assert_eq!(
            conversations[0].title.as_deref(),
            Some("Fix Copilot scan roots")
        );
        assert_eq!(conversations[0].model.as_deref(), Some("gpt-5.4"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn scan_respects_explicit_workspace_hash_roots() {
        let temp_dir = std::env::temp_dir().join(format!(
            "recall-copilot-scan-ws-test-{}",
            uuid::Uuid::new_v4()
        ));
        let workspace_dir = temp_dir.join("workspaceStorage").join("workspace-1");
        let chat_sessions_dir = workspace_dir.join("chatSessions");

        fs::create_dir_all(&chat_sessions_dir).expect("create chat sessions dir");
        fs::write(
            workspace_dir.join("workspace.json"),
            r#"{"folder":"file:///tmp/project"}"#,
        )
        .expect("write workspace json");
        fs::write(
            chat_sessions_dir.join("session-1.jsonl"),
            concat!(
                "{\"kind\":0,\"v\":{",
                "\"sessionId\":\"session-1\",",
                "\"creationDate\":1710000000000,",
                "\"customTitle\":\"Fix Copilot scan roots\",",
                "\"requests\":[{",
                "\"message\":{\"text\":\"Inspect the workspace hash root\"},",
                "\"timestamp\":1710000001000,",
                "\"modelId\":\"copilot/gpt-5.4\",",
                "\"response\":[{\"value\":\"Scanning explicit workspace hash root now.\"}]",
                "}]}}\n"
            ),
        )
        .expect("write chat session");

        let conversations =
            CopilotConnector::new().scan(&[workspace_dir.to_string_lossy().to_string()], None);

        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0].external_id, "session-1");
        assert_eq!(conversations[0].workspace.as_deref(), Some("/tmp/project"));

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
