## Does Recall need Tauri + Rust?

**Short answer: No, but it's a strong fit.** Here's the breakdown:

### What the Rust backend actually does

1. **Filesystem scanning** — recursively walks `~/.claude`, `~/.config/`, VS Code storage, etc. across 8 connectors
2. **SQLite + FTS5** — local database with full-text search, upserts, deduplication
3. **Format parsing** — JSONL, JSON, Markdown, SQLite (`.vscdb`) files from various tools
4. **Background indexing** — incremental rescans every 30s via threads
5. **No heavy computation** — no ML, no image processing, no crypto

### Alternatives

| Option | Stack | Distribution |
|--------|-------|-------------|
| **Tauri + Rust** (current) | React frontend, Rust backend, SQLite | ~10–15 MB binary |
| **Electron + Node.js** | React frontend, Node backend, better-sqlite3 | ~150+ MB binary |
| **Electron + Node.js + Rust (napi-rs)** | React frontend, Node + native modules | ~160+ MB |
| **Web app + local server** | React frontend, Node/Python/Rust CLI server | No installer, run from terminal |
| **Pure CLI (TUI)** | Rust or Node with Ink/blessed | Terminal only |

### Pros of current Tauri + Rust setup

- **Tiny bundle** (~10–15 MB vs Electron's 150+ MB) — ships no Chromium
- **Low memory footprint** — uses system WebView, Rust backend is lean
- **Rust's `rusqlite`** — excellent SQLite/FTS5 support with bundled SQLite
- **Safe concurrency** — `Arc<Mutex<>>`, `mpsc::channel`, `spawn_blocking` are idiomatic and safe
- **Fast filesystem ops** — `walkdir` + `serde_json` parsing is very efficient
- **Cross-platform path handling** — `dirs` crate handles macOS/Linux well
- **Security** — Tauri's capability model restricts IPC surface to declared permissions only

### Cons of current Tauri + Rust setup

- **Development velocity** — Rust has a steeper learning curve; adding a new connector requires Rust knowledge
- **Compile times** — Rust builds are slow (the `target/` directory is already huge)
- **Contributor barrier** — fewer contributors know Rust vs JavaScript/TypeScript
- **WebView inconsistencies** — system WebView (WebKit on macOS, WebKitGTK on Linux) can behave differently from Chrome; CSS/JS quirks are harder to debug
- **No Windows yet** — partly a Tauri issue (WebView2), partly connector path detection not implemented
- **Overkill for the workload** — the Rust backend does mostly I/O (file reads, JSON parsing, SQLite queries). Node.js with `better-sqlite3` would handle this fine with negligible performance difference
- **Two-language codebase** — TypeScript frontend + Rust backend means context-switching and manually keeping types in sync (types.ts mirrors models.rs)

### When Electron + Node.js would be a viable alternative

The core workload (read files, parse JSON/JSONL/Markdown, write to SQLite, serve queries) is **I/O-bound, not CPU-bound**. Node.js handles this well:

- `better-sqlite3` gives synchronous SQLite with FTS5
- `fs` and `glob` handle directory scanning
- `node:worker_threads` for background indexing
- Same React frontend, single language (TypeScript everywhere)
- Larger ecosystem for contributors
- **Tradeoff:** 10x larger binary, higher RAM usage

### Recommendation

The Tauri + Rust choice is **justified but not required**. It makes sense if you prioritize:
- Small distribution size
- Low resource usage
- Security model

Consider switching to Electron if you prioritize:
- Faster feature development
- Broader contributor base
- Consistent cross-platform rendering (Chrome everywhere)
- Single-language codebase (TypeScript end-to-end)

A middle-ground option: keep Tauri but rewrite connectors in **TypeScript running in a sidecar** process, reducing the Rust surface to just the SQLite layer. This preserves the small binary while making connector development accessible to JS/TS contributors.