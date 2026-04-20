# Contributing to Recall

Thanks for considering a contribution. Recall is a small, opinionated MIT project; contributions that keep it fast, local, and vendor-agnostic are very welcome.

## Ground rules

1. **Everything stays local.** No feature may introduce a required network call, telemetry, or cloud dependency.
2. **Type safety end to end.** The TS/Rust boundary is generated from Rust models via `ts-rs`. If your change touches a struct that crosses the IPC boundary, run `npm run types:generate` and commit the result.
3. **Read before writing.** Especially for new connectors: find an existing session file on disk first and work from real data, not a spec.
4. **Small PRs win.** One concern per PR. Connector additions, UI polish, and backend refactors should be separate.

## Development setup

Prereqs: Node ≥ 20.11, Rust stable, platform Tauri 2 build deps. See [`docs/development.md`](docs/development.md).

```sh
git clone https://github.com/akhshyganesh/recall.git
cd recall
npm install
npm run tauri:dev
```

## Before you push

```sh
npm run check      # typecheck all workspaces + cargo check
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

If you touched anything in `apps/desktop/src-tauri/src/models.rs` or any `#[derive(TS)]` struct:

```sh
npm run types:generate
git add packages/shared-types/src/generated
```

## Commit & PR style

- Conventional commit subjects are appreciated but not enforced (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- PR descriptions should explain the **why**. Screenshots/GIFs for UI changes, before/after numbers for performance work.
- Link the issue being closed.

## Adding a new connector

The complete recipe lives in [`docs/connectors.md`](docs/connectors.md). TL;DR:

1. Create `apps/desktop/src-tauri/src/connectors/<slug>.rs`.
2. Implement the `Connector` trait ([`apps/desktop/src-tauri/src/connectors/mod.rs`](apps/desktop/src-tauri/src/connectors/mod.rs)).
3. Register it in `all_connectors()`.
4. Add a `tool-pill` style + icon/theme if needed in [`apps/desktop/src/lib/tool-style.ts`](apps/desktop/src/lib/tool-style.ts).
5. Add a unit test that parses a real sample session file (bring your own fixture if needed).

## Code style

- TypeScript: Prettier + the project's `.prettierrc.json`; `strict` TS; no `any`.
- Rust: `cargo fmt` + `cargo clippy` (no new warnings).
- CSS: the single `apps/desktop/src/styles.css` uses CSS custom properties — follow the existing `--text-N` / `--bg-*` / `--accent` naming.

## Reporting bugs

Open an issue using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Please include:

- OS + version
- Recall version (Settings → About)
- AI tool & version (if connector-specific)
- A minimal session file or the sanitized logs you can share

## Code of conduct

Participation is governed by the [Contributor Covenant](CODE_OF_CONDUCT.md).
