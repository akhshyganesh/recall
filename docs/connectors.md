# Adding a connector

A connector is the thing that turns a particular tool's on-disk session format into Recall's `NormalizedConversation`. Every supported tool is one file in [`apps/desktop/src-tauri/src/connectors/`](../apps/desktop/src-tauri/src/connectors/), implementing the same `Connector` trait.

This document walks through adding a new one, using a fictional tool called **Acme Copilot** as an example.

## 1. Find the session files on disk

Before writing any Rust, confirm:

- Where the tool stores its session history (`~/.config/...`, `~/Library/Application Support/...`, a VS Code `globalStorage` subfolder, etc.).
- The file format (JSON, JSONL, YAML, SQLite, Markdown transcript, …).
- Whether sessions have a stable external ID you can use.
- What counts as an "edit". Recall surfaces per-file `FileChange` rows when the tool provides structured edit events; free-form message content is fine if it doesn't.

Grab a real sample session. Treat it as a test fixture later.

### OS path note (important)

Session roots are not identical across operating systems.

- macOS often uses `~/Library/Application Support/...`
- Linux often uses `~/.config/...`
- Windows usually uses `%APPDATA%\\...` for VS Code-style user data

For VS Code-family tools (Copilot Chat, Cline extension data), the platform-specific user settings paths documented by VS Code map to:

- macOS: `$HOME/Library/Application Support/Code/User/...`
- Linux: `$HOME/.config/Code/User/...`
- Windows: `%APPDATA%\\Code\\User\\...`

For Antigravity, the primary session source is the Gemini-owned artifact tree:

- macOS: `$HOME/.gemini/antigravity/brain/<session-id>/`
- Linux: `$HOME/.gemini/antigravity/brain/<session-id>/`
- Windows: `%USERPROFILE%\.gemini\antigravity\brain\<session-id>\`

Each session directory contains markdown artifacts such as `task.md`, `implementation_plan.md`, and `walkthrough.md`, plus adjacent `*.metadata.json` timestamp metadata. Recall also keeps fallback support for legacy Antigravity app-data chat sessions under `User/workspaceStorage/.../chatSessions/*.json` and `User/globalStorage/emptyWindowChatSessions/*.json` for installs that still populate those stores.

Reference: VS Code settings file locations in the official docs.

## 2. Declare the module

[`apps/desktop/src-tauri/src/connectors/mod.rs`](../apps/desktop/src-tauri/src/connectors/mod.rs):

```rust
pub mod acme;   // add this

pub fn all_connectors() -> Vec<Box<dyn Connector>> {
    vec![
        Box::new(claude_code::ClaudeCodeConnector),
        // ...existing connectors...
        Box::new(acme::AcmeConnector),   // and this
    ]
}
```

## 3. Implement the trait

[`apps/desktop/src-tauri/src/connectors/acme.rs`](../apps/desktop/src-tauri/src/connectors/acme.rs):

```rust
use super::Connector;
use crate::models::{DetectionResult, NormalizedConversation, NormalizedMessage};

pub struct AcmeConnector;

impl Connector for AcmeConnector {
    fn name(&self) -> &'static str { "Acme Copilot" }
    fn agent_slug(&self) -> &'static str { "acme" }

    fn detect(&self) -> DetectionResult {
        let root = dirs::home_dir().map(|h| h.join(".acme/sessions"));

        match root {
            Some(path) if path.exists() => DetectionResult {
                detected: true,
                root_paths: vec![path.to_string_lossy().into_owned()],
                evidence: "Found ~/.acme/sessions".into(),
            },
            _ => DetectionResult {
                detected: false,
                root_paths: vec![],
                evidence: "Expected ~/.acme/sessions".into(),
            },
        }
    }

    fn scan(&self, roots: &[String], since_ts: Option<&str>) -> Vec<NormalizedConversation> {
        // Walk the sessions directory, skip files older than `since_ts`,
        // parse each into one `NormalizedConversation`.
        vec![]
    }
}
```

### Trait contract details

- `agent_slug()` is the stable identifier used in:
  - the deterministic session ID (`{agent_slug}-{hash}`),
  - the `sessions.tool` column,
  - the frontend's `tool-pill` CSS class (see [`apps/desktop/src/lib/tool-style.ts`](../apps/desktop/src/lib/tool-style.ts)).
  Keep it short, lowercase, no spaces, and don't change it after release.
- `scan(roots, since_ts)` must be pure w.r.t. the filesystem — no writes, no network. If `roots` is empty, fall back to the connector's default on-disk locations. If `since_ts` is `Some`, skip files whose mtime is older than that timestamp.
- `scan` runs on a blocking thread. Don't block shorter than necessary, but don't bother with async either.

## 4. Style it

Add the pill color + icon in [`apps/desktop/src/lib/tool-style.ts`](../apps/desktop/src/lib/tool-style.ts):

```ts
export const TOOL_CLASS_BY_MATCH: Array<[RegExp, string]> = [
  // ...existing matches...
  [/acme/i, 'acme'],
];

export const TOOL_THEME_BY_KEY: Record<string, { accent: string; label: string }> = {
  // ...existing themes...
  acme: { accent: '218, 112, 214', label: 'Acme' },
};
```

Add a corresponding `.tool-pill.acme { ... }` rule to [`apps/desktop/src/styles.css`](../apps/desktop/src/styles.css) mirroring the existing ones.

## 5. Test it

Put a redacted real-world sample at `apps/desktop/src-tauri/src/connectors/testdata/acme/session-01.json` and write a unit test that parses it:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_acme_session_fixture() {
        let parsed = parse_session(include_str!("testdata/acme/session-01.json")).unwrap();
        assert_eq!(parsed.messages.len(), 3);
        assert_eq!(parsed.agent_slug, "acme");
    }
}
```

Run:

```sh
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml acme
```

## 6. Document it

- Add the tool to the feature bullet list in [`README.md`](../README.md).
- Add an entry to `CHANGELOG.md` under `[Unreleased] → Added`.

## 7. Open a PR

One PR = one connector. Include:

- the connector module,
- its test fixture,
- the tool-style addition,
- a screenshot of the detected source in Settings,
- a screenshot of a real session rendered in the app.
