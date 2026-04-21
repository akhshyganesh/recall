pub mod aider;
pub mod antigravity;
pub mod claude_code;
pub mod cline;
pub mod codex;
pub mod copilot;
pub mod copilot_cli;
pub mod cursor;
pub mod gemini;

use crate::models::{DetectionResult, NormalizedConversation};

pub trait Connector: Send + Sync {
    fn name(&self) -> &str;
    fn agent_slug(&self) -> &str;
    fn detect(&self) -> DetectionResult;
    fn scan(&self, roots: &[String], since_ts: Option<&str>) -> Vec<NormalizedConversation>;
}

pub fn all_connectors() -> Vec<Box<dyn Connector>> {
    vec![
        Box::new(antigravity::AntigravityConnector::new()),
        Box::new(claude_code::ClaudeCodeConnector::new()),
        Box::new(copilot::CopilotConnector::new()),
        Box::new(copilot_cli::CopilotCliConnector::new()),
        Box::new(cursor::CursorConnector::new()),
        Box::new(aider::AiderConnector::new()),
        Box::new(codex::CodexConnector::new()),
        Box::new(cline::ClineConnector::new()),
        Box::new(gemini::GeminiConnector::new()),
    ]
}
