# Architecture

Recall is a Tauri 2 desktop app with a Rust backend and a React 19 frontend. Everything described below lives in this repository; there are no external services.

```
                   ┌───────────────────────────────────────────────┐
                   │                  Recall app                   │
                   │                                               │
   user edits in   │   ┌──────────────┐         ┌───────────────┐  │
   Copilot / ──────┼──▶│  Connectors  │  scan() │   Indexer     │  │
   Claude / etc.   │   │  (per tool)  │────────▶│ (dedup +      │  │
                   │   └──────────────┘         │  normalize)   │  │
                   │                            └───────┬───────┘  │
                   │                                    │ upsert   │
                   │   ┌──────────────┐ read   ┌────────▼────────┐ │
                   │   │    React     │◀───────│   SQLite +      │ │
                   │   │   frontend   │ search │   FTS5 search   │ │
                   │   └──────┬───────┘        └─────────────────┘ │
                   │          │ Tauri IPC                          │
                   │          │ (typed via ts-rs)                  │
                   └──────────┼────────────────────────────────────┘
                              ▼
                          user browses
```

## Rust crate layout

[`apps/desktop/src-tauri/`](../apps/desktop/src-tauri)

| File | Role |
|------|------|
| `src/main.rs` | Thin `fn main() { recall_app_lib::run() }` shim. |
| `src/lib.rs` | Module wiring, `AppState`, DB path resolution, initial scan thread, `run()`. |
| `src/commands.rs` | All `#[tauri::command]` handlers. |
| `src/exports.rs` | Markdown / JSON / text export builders + filename sanitizer (unit-tested). |
| `src/models.rs` | Wire-format types. Every struct crossing IPC is `#[derive(TS)]` and emits a TS file to `packages/shared-types/src/generated/`. |
| `src/db.rs` | SQLite schema, upsert, FTS5 search, favorites, stats, activity heatmap. |
| `src/indexer.rs` | Orchestrates connectors, deterministic session ID, file-change extraction, normalization. |
| `src/connectors/` | One file per AI tool. All implement the `Connector` trait declared in `connectors/mod.rs`. |

## The `Connector` trait

```rust
pub trait Connector: Send + Sync {
    fn name(&self) -> &'static str;          // e.g. "GitHub Copilot"
    fn agent_slug(&self) -> &'static str;    // e.g. "copilot"
    fn detect(&self) -> DetectionResult;
    fn scan(&self, since: Option<&str>) -> Vec<NormalizedConversation>;
}
```

- `detect()` is called by the Settings screen to render "Detected sources". It should be cheap and never parse a full session file.
- `scan(since)` is called during the initial scan and on every incremental rescan. The `since` timestamp lets the connector skip files whose `mtime` is older.

## Data flow: `scan_all`

1. User clicks "Scan for Sessions" in the UI.
2. `api.scanAll()` (frontend) invokes the `scan_all` Tauri command.
3. `commands::scan_all` spawns a blocking task that iterates every registered connector.
4. Each connector yields `NormalizedConversation` values. The indexer turns each into a `Session` (computing a deterministic ID), then upserts into SQLite.
5. Total row count is returned to the frontend, which reloads metadata and re-queries the current view.

## Incremental rescan

A React effect (`useIncrementalScan`) ticks every 30 seconds and calls `scan_incremental(since_ts)` with `now() - 30s`. Connectors use `since_ts` to skip unchanged files, so the per-tick cost is proportional to the number of edited files, not the full history.

## Database

Single SQLite file at:

- macOS: `~/Library/Application Support/com.recall.app/recall.db`
- Linux: `$XDG_DATA_HOME/com.recall.app/recall.db` (or `~/.local/share/com.recall.app/...`)
- Windows: `%LOCALAPPDATA%\com.recall.app\recall.db`

Tables:

| Table | Purpose |
|-------|---------|
| `sessions` | One row per session (title, tool, repo_path, model, timestamps, JSON metadata). |
| `messages` | One row per message, keyed by `(session_id, idx)`. |
| `file_changes` | Per-file diff rows extracted from structured message parts. |
| `favorites` | Session IDs the user starred. |
| `search_index` | FTS5 virtual table over `(title, content)`, porter + unicode61. |

Deterministic session ID: `sha16({agent_slug}::{external_id})`, prefixed with the agent slug. This makes reindexing idempotent and lets external IDs merge safely with the `external_id` column used in upsert conflict resolution.

## Frontend

[`apps/desktop/src/`](../apps/desktop/src)

| Path | Role |
|------|------|
| `App.tsx` | Root view switcher, view state, filters. |
| `hooks/` | `useUpdateCheck`, `useMobileSidebar`, `useKeyboardShortcuts`, `useIncrementalScan`. |
| `components/` | Presentational components (Sidebar, SessionDetail, SessionFeed, LandingHero, ActivityHeatmap, …). |
| `components/message-body/` | Structured-message renderer: code blocks, diffs, tool calls, thinking accordions. |
| `lib/` | `session-format`, `tool-style`, `release-check`, `update-format`, `download`. |
| `api.ts` | Typed wrappers around `invoke(...)`; one function per Tauri command. |
| `types.ts` | Re-export shim that forwards `@recall/shared-types`. |

The frontend holds no business logic about connectors. It receives `Session` / `Message` / `FileChange` values and renders them.

## IPC typing

Every Tauri command parameter and return value is a Rust struct with `#[derive(TS)]`. Running `npm run types:generate` (under the hood: `cargo test export_bindings` in `apps/desktop/src-tauri`) writes a `.ts` file per struct into [`packages/shared-types/src/generated/`](../packages/shared-types/src/generated). The TypeScript workspace consumes these via the `@recall/shared-types` package. Because the generated files are **committed**, a fresh clone can typecheck without running `cargo` first.

## Update check

On boot (and on demand from the Settings screen), the frontend calls `https://api.github.com/repos/akhshyganesh/recall/releases/latest`, caches the result in-memory for 10 minutes ([`lib/release-check.ts`](../apps/desktop/src/lib/release-check.ts)), and compares the tag to the running version with a semver-aware comparator. If a newer version exists, the sidebar shows an "Update available" banner linking to the release page. The app does not auto-download or auto-install.

## Tests

- `cargo test` runs unit tests in `indexer`, `exports`, `commands`, and `connectors::copilot_cli`. It also runs the auto-generated `ts_rs` binding tests which write the TypeScript files out as a side effect.
- The frontend does not have a runtime test suite today. PRs that add Vitest + React Testing Library coverage for `hooks/` are welcome.

## Things the app deliberately does not do

- No auto-updater binary install (GitHub link only).
- No built-in AI or remote inference.
- No writes to session source files.
- No background daemon — indexing only runs while the app is open.
