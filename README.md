# Recall

> Local, private search across your AI coding session history — Copilot, Claude Code, Cursor, Aider, Codex, Cline, Gemini, and more.

Recall scans the session files that AI coding assistants already write to your disk, normalizes them into a single SQLite database with full-text search, and gives you a fast desktop UI to browse, search, favorite, and export them. **Everything stays local.** No network calls, no telemetry, no account.

<p align="center">
  <img src="docs/screenshots/welcome.png" alt="Recall home screen" width="760" />
  <br/>
  <em>Welcome screen — every detected AI tool at a glance.</em>
</p>

<p align="center">
  <img src="docs/screenshots/session-chat.png" alt="A rendered session" width="760" />
  <br/>
  <em>A session rendered with messages, diffs, and tool calls.</em>
</p>

## Why

Modern AI tools produce enormous amounts of useful context — edits, reasoning, tool calls, file diffs — and then bury it in tool-specific storage formats that disappear the moment you close the pane. Recall turns that history into something you own and can query.

## Features

- **8 connectors** out of the box: GitHub Copilot (VS Code & CLI), Claude Code, Cursor, Aider, OpenAI Codex, Cline, Gemini.
- **Unified view**: every session rendered with the same message/diff/tool-call pipeline, regardless of vendor.
- **Full-text search** via SQLite FTS5 with snippet highlighting.
- **Activity heatmap**, per-tool breakdown, per-repo filtering.
- **Favorites and tabs** for sessions you keep coming back to.
- **Exports**: Markdown, JSON, or plain text, any session, any time.
- **Incremental rescan** every 30 s so new sessions show up automatically.
- **Auto-update check** against GitHub Releases.
- **Local-first, offline-first**: SQLite on-disk, no cloud, no telemetry.

## Install

Prebuilt binaries for macOS (arm64) and Linux (x86_64) are published on the [Releases page](https://github.com/akhshyganesh/recall/releases). Windows builds can be produced locally — see [`docs/development.md`](docs/development.md).

### macOS — "damaged and can't be opened"

macOS Gatekeeper quarantines unsigned apps downloaded from the internet. Because Recall is not notarized with an Apple Developer certificate, macOS will block it with a misleading "damaged" error. To fix this, open Terminal and run:

```sh
xattr -cr /Applications/Recall.app
```

This strips the quarantine attribute. The app itself is fine — Apple simply displays this message for all unsigned downloads on macOS Ventura and later.

## Repository layout

```
.
├── apps/
│   └── desktop/          # Tauri 2 + React 19 desktop app
│       ├── src/          # Frontend (React, hooks, components)
│       └── src-tauri/    # Rust backend: DB, indexer, connectors
├── packages/
│   └── shared-types/     # TS types generated from Rust via ts-rs
├── docs/
│   ├── architecture.md   # System design
│   ├── connectors.md     # How to add a new connector
│   ├── development.md    # Local setup
│   └── release.md        # Release engineering
├── scripts/
│   └── release.sh        # Version bump + tag
└── .github/
    └── workflows/        # CI + Release pipelines
```

## Quickstart (development)

Prerequisites: Node ≥ 20.11, Rust stable, platform-specific Tauri 2 build deps ([see their docs](https://v2.tauri.app/start/prerequisites/)).

```sh
git clone https://github.com/akhshyganesh/recall.git
cd recall
npm install
npm run tauri:dev
```

Run only the web layer:

```sh
npm run dev
```

Regenerate TypeScript types from Rust:

```sh
npm run types:generate
```

Run the full check (typecheck every workspace + `cargo check`):

```sh
npm run check
```

See [`docs/development.md`](docs/development.md) for deeper guidance.

## Architecture, at a glance

Each connector lives in [`apps/desktop/src-tauri/src/connectors/`](apps/desktop/src-tauri/src/connectors/) and implements a single trait:

```rust
pub trait Connector: Send + Sync {
    fn name(&self) -> &'static str;
    fn agent_slug(&self) -> &'static str;
    fn detect(&self) -> DetectionResult;
    fn scan(&self, since: Option<&str>) -> Vec<NormalizedConversation>;
}
```

The indexer runs every connector in parallel, normalizes the output, and upserts into SQLite. The frontend talks to the Rust backend exclusively through typed Tauri commands (see [`apps/desktop/src-tauri/src/commands.rs`](apps/desktop/src-tauri/src/commands.rs)). The TypeScript types for every IPC payload are **auto-generated from the Rust structs** via [`ts-rs`](https://crates.io/crates/ts-rs), so the frontend and backend cannot drift.

For the full picture — database schema, rendering pipeline, update check, release flow — read [`docs/architecture.md`](docs/architecture.md).

## Contributing

Yes, please. [`CONTRIBUTING.md`](CONTRIBUTING.md) walks through the contribution flow, and [`docs/connectors.md`](docs/connectors.md) is a step-by-step recipe for adding a new AI tool.

## Security

Recall only **reads** local files written by AI assistants. It never modifies them and never sends them anywhere. See [`SECURITY.md`](SECURITY.md) for the threat model and how to report a vulnerability.

## License

[MIT](LICENSE). © Akhshy Ganesh.
