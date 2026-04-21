# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Repository restructured** into a monorepo with `apps/desktop/` and `packages/shared-types/`.
- Rust backend split: `lib.rs` now only wires the app; `commands.rs` holds all Tauri handlers; `exports.rs` holds the Markdown/JSON/text formatters.
- TypeScript types shared between the Rust backend and the React frontend are now auto-generated from Rust structs via [`ts-rs`](https://crates.io/crates/ts-rs) (`npm run types:generate`).
- `App.tsx` slimmed down by extracting `useUpdateCheck`, `useMobileSidebar`, `useKeyboardShortcuts`, and `useIncrementalScan`.

### Added

- Antigravity connector for built-in chat sessions on macOS, Linux, and Windows.
- `@recall/shared-types` workspace package.
- Unit tests for `exports` and the export filename sanitizer.
- CI workflow (`.github/workflows/ci.yml`): typecheck, build, `cargo check`, `cargo test`, `cargo clippy`, `cargo fmt --check`.
- OSS scaffolding: `CODE_OF_CONDUCT.md`, `SECURITY.md`, `docs/architecture.md`, `docs/connectors.md`, `docs/development.md`, `docs/release.md`, issue & PR templates.
- Release profile tuned for size: `panic = "abort"`, `lto = true`, `opt-level = "s"`, `strip = true`.

## [0.4.5] — 2025-01 (pre-restructure baseline)

The single-crate Tauri app from which the current monorepo was carved. Feature set:

- 8 connectors (Copilot, Copilot CLI, Claude Code, Cursor, Aider, Codex, Cline, Gemini)
- SQLite FTS5 full-text search
- Activity heatmap, favorites, session tabs
- Markdown / JSON / text export
- Incremental rescan every 30 seconds
- Update check against GitHub Releases

## Earlier versions

See the [GitHub Releases page](https://github.com/akhshyganesh/recall/releases) for the full history prior to `0.4.5`.
