<div align="center">
  <img src="public/logo.png" width="144" height="144" alt="Recall" />
  <h1>Recall</h1>

  <p><strong>Open-source lightweight terminal workspace</strong></p>

  <p>
    <img src="https://img.shields.io/github/v/release/akhshyganesh/recall?label=version&color=blue" alt="version" />
    <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="platform" />
  </p>
</div>

---

Recall is a fast, lightweight terminal workspace built on Tauri 2 + Rust and React 19. It pairs a native PTY backend with a modern UI — multi-tab terminals with split panes, an integrated code editor, source control, contextual AI session history, and git-aware development context. Under 10 MB on disk. No telemetry.

## Known macOS notice

If macOS shows:

- `"Recall" is damaged and can't be opened. You should move it to the Bin.`
- `Apple could not verify "Recall" is free of malware...`

that means the downloaded app build was not notarized by Apple yet.

Known workaround from Terminal after moving the app into `/Applications`:

```bash
xattr -dr com.apple.quarantine /Applications/Recall.app
```

This is a known distribution issue for non-notarized macOS builds. The release workflow supports Apple signing and notarization when the required Apple secrets are configured.

## Features

**Terminal**
- xterm.js + WebGL renderer, multi-tab with background streaming
- Native PTY backend via `portable-pty` (zsh, bash, fish, pwsh, cmd, …)
- Split panes with resizable layout
- Shell integration (cwd tracking, prompt markers) via injected init scripts
- Inline search, link detection, true-color

**Editor**
- CodeMirror 6 with language support for TypeScript/JavaScript, Rust, Python, Go, HTML/CSS, JSON, Markdown, C/C++/Java/C#, PHP
- Vim mode
- Prebuilt themes: Tokyo Night, Nord, GitHub, Atom One, Aura, Copilot, Xcode

**Source Control**
- Git status panel — stage, unstage, commit, branch switching
- Git history with commit graph and per-commit diffs
- Per-file diff view
- Direct links to commits on GitHub/GitLab

**Session History**
- Indexes AI coding tool sessions: Claude Code, GitHub Copilot, Codex, and more
- Search, activity heatmaps, export to Markdown, JSON, or text
- Built-in MCP server so AI tools can query your session history

**File Explorer**
- Catppuccin icon theme (Material Icon Theme resolver)
- Fuzzy search, keyboard navigation, inline rename, context actions

**Preview**
- Web preview: auto-detects local dev servers and opens them in a sandboxed tab
- Image, video, and audio viewers
- Markdown renderer

**Extensions**
- Built-in extensions: Todo, Snippets, Scratch Pad
- Extension API for custom sidebar panels, tab renderers, and commands

**Quality**
- Lightweight (~8 MB bundle)
- No telemetry, no account required
- Auto-updater with signature verification
- Command palette
- Settings window with accent color picker

## Windows notes

- **SmartScreen warning**: Windows will show "Windows protected your PC" on first launch because we don't have a code-signing certificate yet. Click **More info** → **Run anyway**.
- **Context menu**: the NSIS installer registers a "Open with Recall" entry in Windows Explorer.

The default shell is detected in this order: `pwsh.exe` (PowerShell 7+) → `powershell.exe` (Windows PowerShell 5.1) → `cmd.exe`.

## Linux notes

- **Arch / AUR**: install via `yay -S recall-bin` (or `paru`, etc.). Tracks the latest release.
- **AppImage**: needs FUSE. Without it: `./Recall_*.AppImage --appimage-extract-and-run`. On Wayland with rendering glitches, try `WEBKIT_DISABLE_DMABUF_RENDERER=1`; otherwise use the `.deb` / `.rpm` which link against the system's GTK stack.
- **Snap-packaged editors**: if you run Recall from Snap-packaged VS Code or a Snap shell, the repo's `pnpm run tauri ...` wrapper strips Snap-only GTK/runtime paths before launch to avoid host glibc symbol lookup failures.

## Build from source

**Prerequisites**
- Rust (stable) — https://rustup.rs
- Node 20+ and [pnpm](https://pnpm.io)
- Platform-specific Tauri prerequisites — https://tauri.app/start/prerequisites/

**Ubuntu / Debian**
```bash
sudo apt update
sudo apt install pkg-config build-essential curl wget file libssl-dev libxdo-dev libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev libayatana-appindicator3-dev librsvg2-dev
```

You can verify the Linux native prerequisites before starting Tauri with:
```bash
pnpm run tauri:prereqs
```

**Run**
```bash
pnpm install
pnpm tauri dev          # development
pnpm tauri build        # production bundle
```

**Checks**
```bash
pnpm exec tsc --noEmit          # frontend type-check
cd src-tauri && cargo clippy    # Rust lint
```

## Tech stack

Tauri 2 · Rust · `portable-pty` · React 19 · TypeScript · xterm.js · CodeMirror 6 · Tailwind v4 · shadcn/ui · Zustand

## Contributing

Issues and PRs are welcome. Open an issue or discuss in [Discord](https://discord.gg/tyveTUyEp7) before starting anything non-trivial. For security issues, use GitHub's private security reporting — don't file them as public issues.

## Acknowledgments

Recall was built by combining the best of two earlier solo projects by [@akhshyganesh](https://github.com/akhshyganesh):

- **Recall** — the original session history and workspace context tooling
- **[terax-ai](https://github.com/akhshyganesh/terax-ai)** — a terminal-first IDE prototype whose layout, split-pane architecture, and IDE-like approach to the CLI inspired this version

The big-company bet is that the future of development lives in the CLI — building a full terminal workspace that feels like an IDE for CLI programs is the idea behind Recall.

## License

Apache 2.0 — see [LICENSE](LICENSE). Copyright 2026 akhshyganesh.
