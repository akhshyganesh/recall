# Roadmap

Recall direction, what's shipped, what's coming, and what's deliberately out of scope.

This file is updated as direction evolves. For day-to-day work, see [GitHub Issues](https://github.com/akhshyganesh/recall/issues) and the Projects board.

## What Recall is

Recall is a fast, lightweight terminal workspace. It pairs a native PTY backend with a modern UI: multi-tab terminals, an integrated code editor, a file explorer, source control, preview surfaces, and contextual session history. Under 10 MB on disk. No telemetry.

The product is opinionated: terminal-first, lightweight always, cross-platform without compromise.

## What Recall is not

- Not a full IDE replacement. Heavy IDE features that overlap with VS Code / Cursor / Zed are out of scope.
- Not a browser. Web preview exists for local dev servers and lightweight doc viewing only.
- Not a general workspace. Tools and formats that pull the product away from the terminal-first surface are out of scope.
- Not a one-size-fits-all CLI replacement. The goal is a focused terminal workspace, not "shell with extras".

## Themes

The themes below frame every scope decision.

1. **Lightweight always.** 7-8 MB binary. Every dependency justified. Per-tab memory budget enforced.
2. **Terminal-first.** xterm.js correctness, PTY fidelity, TUI app compatibility are non-negotiable.
3. **Cross-platform parity.** macOS, Linux, Windows, WSL. No platform-specific exclusives.
4. **Security by default.** OSC trust, IPC sandboxing, and safe host integration by default.
5. **Focused workspace context.** Editor, source control, preview, and session history should support the terminal without overwhelming it.

## Shipped

### Terminal

- [x] Multi-tab terminal with WebGL renderer
- [x] Native PTY backend (zsh, bash, pwsh, fish, cmd)
- [x] Split panes
- [x] Shell integration (cwd, prompt markers)
- [x] Inline search, link detection, true-color
- [x] WSL bridge as workspace environment

### Editor

- [x] Multi-language support (TypeScript / JavaScript, Rust, Python, HTML / CSS, JSON, Markdown, Go, C / C++ / Java / C#, PHP)
- [x] Vim mode
- [x] Prebuilt themes

### File Explorer

- [x] Icon theme with full file-type coverage
- [x] Fuzzy search, keyboard navigation, inline rename, context actions

### Git / Source Control

- [x] Source control panel (stage, commit, branch)
- [x] Git history with commit graph
- [x] Per-file diffs

### Web Preview

- [x] Auto-detected local dev server preview
- [x] Image and PDF viewers
- [x] Sandboxed iframe

### Platform Integration

- [x] macOS, Linux (.deb / .rpm / AppImage), Windows (NSIS), WSL
- [x] AUR (Arch)
- [x] Windows Explorer context-menu integration
- [x] Auto-updater
- [x] No telemetry

### Security

- [x] Trust gating in terminal escape-sequence handling
- [x] Sandboxed preview surface

## Planned

### Coming next

- [ ] SSH support (PTY auth and known_hosts first; SFTP and port forwarding later)
- [ ] Inline terminal auto-suggestions (history-based first)
- [ ] Themes and customizations (terminal themes, UI accents, keybindings, layout)
- [ ] Drag and drop in terminal (files as quoted paths)
- [ ] Persistent terminal sessions and layout restore
- [ ] Preview surface expansion (better image / Markdown handling)
- [ ] Test coverage expansion (PTY edge cases, security functions)

### Longer horizon

- [ ] Release automation (CHANGELOG, version bump, tag flow)
- [ ] Bundle optimization (lazy-load language packs, individual UI primitive imports, tree-shake)
- [ ] Selective TS → Rust migration where the profiler shows measurable wins
- [ ] Live filesystem updates in explorer and editor

## Wanted contributions

Strategic areas where help is welcome. Pick something and propose an approach in Discord or via an issue first.

- **Test coverage.** PTY edge cases across platforms, session indexing, preview handling, and security-sensitive paths.
- **Bundle optimization.** Profile and propose specific dependency replacements or tree-shake fixes.
- **Platform-specific bugs.** Rendering issues on niche distros, shell quirks, WSL edge cases.
- **Documentation and translations.** Improvements, screenshots, examples, non-English README sections.
- **Themes.** Terminal and editor themes, UI accent palettes that fit the lightweight aesthetic.

See `good-first-issue` and `help-wanted` labels on GitHub Issues for concrete tasks.

## Out of scope

Categories that will not be built into Recall. Individual feature requests in these categories will be closed.

- **Heavy IDE features.** Full language-server integration, integrated debuggers, refactoring engines, project-wide search at IDE scale. Use a real editor for those.
- **Notebook and document workspaces.** Anything that turns Recall into a document host rather than a terminal.
- **Package manager and toolchain UIs.** Use `npm`, `pip`, `cargo` and friends in the terminal directly.
- **Full web browser features.** Preview pane stays scoped to local dev servers and lightweight doc viewing. No navigation history, no bookmarks, no dev tools.
- **Telemetry, analytics, accounts.** Recall stays offline-respectful.
- **Extension marketplaces at IDE scale.** Arbitrary UI or behavior extensions are out of scope.
- **Third-party subscription session bridges.** Forwarding cloud subscription auth (provider-managed login sessions) through Recall is not technically feasible for third-party clients.

## Decision authority

Direction and scope decisions are made by [@akhshyganesh](https://github.com/akhshyganesh). Trusted reviewers (informal, no fixed roles yet) provide input on security, performance, and platform-specific areas.

If a PR is closed and you disagree, raise it in Discord. Happy to discuss, not happy to be ambushed in a PR comment thread.

This will likely formalize over time as the project grows.
