pub mod antigravity;
pub mod claude_code;
pub mod codex;
pub mod copilot;
pub mod copilot_cli;
pub mod pi;

use crate::modules::sessions::models::{DetectionResult, NormalizedConversation};

pub const SUPPORTED_AGENT_SLUGS: &[&str] = &[
    "copilot",
    "copilot_cli",
    "antigravity",
    "claude_code",
    "codex",
    "pi",
];

pub trait Connector: Send + Sync {
    fn name(&self) -> &str;
    fn agent_slug(&self) -> &str;
    fn detect(&self) -> DetectionResult;
    fn scan(&self, roots: &[String], since_ts: Option<&str>) -> Vec<NormalizedConversation>;
}

pub fn all_connectors() -> Vec<Box<dyn Connector>> {
    vec![
        Box::new(copilot::CopilotConnector::new()),
        Box::new(copilot_cli::CopilotCliConnector::new()),
        Box::new(antigravity::AntigravityConnector::new()),
        Box::new(claude_code::ClaudeCodeConnector::new()),
        Box::new(codex::CodexConnector::new()),
        Box::new(pi::PiConnector::new()),
    ]
}

#[cfg(test)]
mod tests {
    use super::{all_connectors, SUPPORTED_AGENT_SLUGS};
    use std::collections::{HashMap, HashSet};
    use std::fs;
    use std::path::Path;

    fn write_fixture(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create fixture parent dir");
        }
        fs::write(path, content).expect("write fixture file");
    }

    fn create_connector_fixtures(base_dir: &Path) -> HashMap<&'static str, String> {
        let mut roots = HashMap::new();

        let antigravity_root = base_dir
            .join("windows")
            .join("UserProfile")
            .join(".gemini")
            .join("antigravity");
        write_fixture(
            &antigravity_root.join("brain/session-1/task.md"),
            "# Investigate antigravity connector\n\nFix antigravity smoke fixture.",
        );
        write_fixture(
            &antigravity_root.join("brain/session-1/task.md.metadata.json"),
            r#"{"summary":"Investigate antigravity connector","updatedAt":"2026-04-21T10:00:00Z"}"#,
        );
        write_fixture(
            &antigravity_root.join("brain/session-1/walkthrough.md"),
            "Antigravity walkthrough output.",
        );
        write_fixture(
            &antigravity_root.join("brain/session-1/walkthrough.md.metadata.json"),
            r#"{"updatedAt":"2026-04-21T10:00:01Z"}"#,
        );
        roots.insert(
            "antigravity",
            antigravity_root.to_string_lossy().to_string(),
        );

        let claude_root = base_dir.join("linux").join(".claude");
        write_fixture(
            &claude_root.join("projects/project-a/session-1.jsonl"),
            concat!(
                "{\"type\":\"user\",\"sessionId\":\"claude-session-1\",\"cwd\":\"/tmp/claude-project\",\"timestamp\":\"2026-04-21T10:00:00Z\",\"content\":\"Fix claude code session\"}\n",
                "{\"type\":\"assistant\",\"model\":\"claude-3.7-sonnet\",\"timestamp\":\"2026-04-21T10:00:01Z\",\"content\":\"Patched claude code session\"}\n"
            ),
        );
        roots.insert("claude_code", claude_root.to_string_lossy().to_string());

        let codex_root = base_dir.join("linux").join(".codex");
        write_fixture(
            &codex_root.join("sessions/rollout-1.json"),
            r#"{"session":{"cwd":"/tmp/codex-project"},"items":[{"role":"user","content":[{"text":"Fix codex rollout"}],"created_at":"2026-04-21T10:00:00Z"},{"role":"assistant","content":[{"text":"Patched codex rollout"}],"created_at":"2026-04-21T10:00:01Z"}]}"#,
        );
        roots.insert("codex", codex_root.to_string_lossy().to_string());

        let copilot_root = base_dir
            .join("macos")
            .join("Library")
            .join("Application Support")
            .join("Code")
            .join("User")
            .join("workspaceStorage");
        write_fixture(
            &copilot_root.join("workspace-1/workspace.json"),
            r#"{"folder":"file:///tmp/copilot-project"}"#,
        );
        write_fixture(
            &copilot_root.join("workspace-1/chatSessions/session-1.jsonl"),
            concat!(
                "{\"kind\":0,\"v\":{",
                "\"sessionId\":\"copilot-session-1\",",
                "\"creationDate\":1710000000000,",
                "\"customTitle\":\"Fix Copilot scan roots\",",
                "\"requests\":[{",
                "\"message\":{\"text\":\"Inspect the workspace storage root\"},",
                "\"timestamp\":1710000001000,",
                "\"modelId\":\"copilot/gpt-5.4\",",
                "\"response\":[{\"value\":\"Scanning explicit roots now.\"}]",
                "}]}}\n"
            ),
        );
        roots.insert("copilot", copilot_root.to_string_lossy().to_string());

        let copilot_cli_root = base_dir
            .join("windows")
            .join("UserProfile")
            .join(".copilot")
            .join("session-state");
        write_fixture(
            &copilot_cli_root.join("session-1/workspace.yaml"),
            "id: session-1\ncwd: /tmp/copilot-cli-project\ngit_root: /tmp/copilot-cli-project\nrepository: owner/repo\nhost_type: github\nbranch: main\nsummary: Copilot CLI Fix\ncreated_at: 2026-04-21T10:00:00Z\nupdated_at: 2026-04-21T10:00:01Z\n",
        );
        write_fixture(
            &copilot_cli_root.join("session-1/events.jsonl"),
            concat!(
                "{\"type\":\"session.start\",\"data\":{\"sessionId\":\"session-1\",\"context\":{\"cwd\":\"/tmp/copilot-cli-project\",\"gitRoot\":\"/tmp/copilot-cli-project\",\"branch\":\"main\",\"repository\":\"owner/repo\",\"hostType\":\"github\"}},\"timestamp\":\"2026-04-21T10:00:00Z\"}\n",
                "{\"type\":\"session.model_change\",\"data\":{\"newModel\":\"gpt-5.4\"},\"timestamp\":\"2026-04-21T10:00:00Z\"}\n",
                "{\"type\":\"user.message\",\"data\":{\"content\":\"Fix copilot cli session\"},\"timestamp\":\"2026-04-21T10:00:00Z\"}\n",
                "{\"type\":\"assistant.message\",\"data\":{\"content\":\"Patched copilot cli session\"},\"timestamp\":\"2026-04-21T10:00:01Z\"}\n"
            ),
        );
        roots.insert(
            "copilot_cli",
            copilot_cli_root.to_string_lossy().to_string(),
        );

        let pi_root = base_dir.join("home").join(".pi").join("agent");
        write_fixture(
            &pi_root.join("sessions/--tmp-pi-project--/2026-06-02T06-22-33-551Z_test-pi-session.jsonl"),
            concat!(
                "{\"type\":\"session\",\"version\":3,\"id\":\"test-pi-session\",\"timestamp\":\"2026-06-02T06:22:33.551Z\",\"cwd\":\"/tmp/pi-project\"}\n",
                "{\"type\":\"model_change\",\"id\":\"abc\",\"parentId\":null,\"timestamp\":\"2026-06-02T06:22:33.643Z\",\"provider\":\"ollama\",\"modelId\":\"qwen3:27b\"}\n",
                "{\"type\":\"message\",\"id\":\"msg1\",\"timestamp\":\"2026-06-02T06:22:35.786Z\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"Fix pi session\"}]}}\n",
                "{\"type\":\"message\",\"id\":\"msg2\",\"timestamp\":\"2026-06-02T06:22:51.905Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Patched pi session\"}],\"model\":\"qwen3:27b\"}}\n",
            ),
        );
        roots.insert("pi", pi_root.to_string_lossy().to_string());

        roots
    }

    #[test]
    fn all_connectors_have_unique_agent_slugs() {
        let connectors = all_connectors();

        let slugs: Vec<String> = connectors
            .iter()
            .map(|connector| connector.agent_slug().to_string())
            .collect();
        assert_eq!(slugs, SUPPORTED_AGENT_SLUGS);

        let unique: HashSet<String> = slugs.iter().cloned().collect();

        assert_eq!(slugs.len(), unique.len());
    }

    #[test]
    fn all_connectors_scan_smoke_fixtures() {
        let temp_dir =
            std::env::temp_dir().join(format!("recall-connectors-smoke-{}", uuid::Uuid::new_v4()));
        let fixture_roots = create_connector_fixtures(&temp_dir);

        for connector in all_connectors() {
            let root = fixture_roots
                .get(connector.agent_slug())
                .unwrap_or_else(|| panic!("missing fixture root for {}", connector.agent_slug()));
            let conversations = connector.scan(std::slice::from_ref(root), None);

            assert_eq!(
                conversations.len(),
                1,
                "expected one conversation for {}",
                connector.agent_slug()
            );

            let conversation = &conversations[0];
            assert_eq!(conversation.agent_slug, connector.agent_slug());
            assert!(!conversation.messages.is_empty());
            assert!(conversation.source_path.contains(root));
        }

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
