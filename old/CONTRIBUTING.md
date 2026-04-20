# Contributing to Recall

Thanks for contributing. This repository is a local-first desktop app that indexes AI coding session history into a SQLite database and presents it through a Tauri + React UI.

## Project principles

- Keep docs and UI copy aligned with the **actual behavior in code today**
- Preserve the app's **local-first** model; indexed session data should stay on the user's machine
- Prefer extending the existing normalization flow instead of creating source-specific UI paths when a shared model already exists
- Keep README media in `docs/screenshots/` so public-facing assets stay easy to find

## Local setup

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run tauri dev
```

Build the frontend bundle:

```bash
npm run build
```

Run the repository-level verification command:

```bash
npm run check
```

There is no dedicated lint script yet.

## Where to make changes

| Area | Primary files |
| --- | --- |
| App state, view switching, scans, search | `src/App.tsx` |
| Session list/detail/settings UI | `src/components/` |
| Markdown, code, diff, and Copilot rich message rendering | `src/MessageBody.tsx` |
| Frontend-to-backend command calls | `src/api.ts` |
| Tauri commands and startup scan | `src-tauri/src/lib.rs` |
| SQLite schema, search, favorites, exports | `src-tauri/src/db.rs` |
| Cross-connector normalization | `src-tauri/src/indexer.rs`, `src-tauri/src/models.rs` |
| Tool-specific source detection and parsing | `src-tauri/src/connectors/` |

## Adding or changing a connector

Every source connector follows the same pattern:

1. Implement the `Connector` trait in `src-tauri/src/connectors/`
2. Return real detection information from `detect()`
3. Parse source data into `NormalizedConversation` and `NormalizedMessage`
4. Register the connector in `all_connectors()` in `src-tauri/src/connectors/mod.rs`

Try to keep extracted fields consistent with the rest of the app:

- `workspace` / `repo_path` when it can be inferred
- `title` from source metadata or the first useful user prompt
- `started_at`, `ended_at`, and `source_mtime` when available
- `model` and `branch` only when the source actually exposes them

## Notes for message rendering work

If you change GitHub Copilot parsing, keep `src-tauri/src/connectors/copilot.rs` and `src/MessageBody.tsx` in sync. The frontend currently understands structured Copilot message parts such as thinking blocks, tool calls, and inline file edits reconstructed from Copilot edit state.

Session-level `file_changes` are now derived from structured `text_edit` message parts during indexing. If you change that contract, keep the Rust extraction logic and the frontend detail views in sync. At the moment, structured file-edit data mainly comes from the GitHub Copilot connector.

## Pull request expectations

- Keep changes focused
- Update docs when behavior changes
- Do not describe roadmap features as if they already ship
- Run `npm run check`
- If you changed desktop/runtime behavior, also smoke-test with `npm run tauri dev` when your environment has Tauri prerequisites installed

## License

By contributing, you agree that your contributions will be licensed under the **MIT License** used by this repository.
