# Local development

## Prerequisites

- **Node** ≥ 20.11 (nvm users: `nvm use` picks up `.node-version`)
- **npm** ≥ 10 (ships with Node 20)
- **Rust** stable toolchain (`rustup update stable`)
- Platform-specific Tauri 2 build dependencies — follow [the Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) once per machine.

## First-time setup

```sh
git clone https://github.com/akhshyganesh/recall.git
cd recall
npm install
```

## Run the app in development

```sh
npm run tauri:dev
```

Vite serves the frontend on `http://localhost:1420` and Tauri opens a native window that loads it. Changes to `apps/desktop/src/**` hot-reload. Changes to `apps/desktop/src-tauri/**` trigger a Rust rebuild and window restart.

## Run only the web UI

```sh
npm run dev
```

Useful for pure CSS/layout work. Tauri commands will fail because the runtime isn't there, but the UI renders.

## Typecheck / build / cargo check

```sh
npm run typecheck    # every workspace
npm run build        # production Vite bundle + typecheck
npm run check        # typecheck + `cargo check`
```

## Regenerate TypeScript types from Rust

Whenever you touch any struct with `#[derive(TS)]` (anything in `models.rs` or a command payload):

```sh
npm run types:generate
git add packages/shared-types/src/generated
```

Under the hood this runs `cargo test export_bindings` inside `apps/desktop/src-tauri`. The ts-rs crate emits the TypeScript files as a side-effect of the generated tests.

## Run the Rust tests

```sh
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Lint

```sh
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
```

## Produce a release build locally

```sh
npm run tauri:build
```

Artifacts land in `apps/desktop/src-tauri/target/release/bundle/`:

- macOS: `.app`, `.dmg`
- Linux: `.deb`, `.AppImage`
- Windows: `.msi`, `.exe`

For signed macOS builds you need a Developer ID certificate and the appropriate env vars — see [Tauri signing](https://v2.tauri.app/distribute/sign/macos/).

## Database location

Recall reads from and writes to:

- macOS: `~/Library/Application Support/com.recall.app/recall.db`
- Linux: `$XDG_DATA_HOME/com.recall.app/` or `~/.local/share/com.recall.app/`
- Windows: `%LOCALAPPDATA%\com.recall.app\`

The **Clear database** button in Settings wipes this file. You can also delete it manually and restart the app to force a full rescan.

## Session source roots by OS

Session folders are tool-specific and are not the same path across macOS, Linux, and Windows.

- Copilot Chat (VS Code workspace storage): macOS `$HOME/Library/Application Support/Code/User/workspaceStorage/.../chatSessions/`; Linux `$HOME/.config/Code/User/workspaceStorage/.../chatSessions/`; Windows `%APPDATA%\\Code\\User\\workspaceStorage\\...\\chatSessions\\`
- Cline extension storage (VS Code globalStorage): macOS `$HOME/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/` or `.../cline.cline/`; Linux `$HOME/.config/Code/User/globalStorage/saoudrizwan.claude-dev/` or `.../cline.cline/`; Windows `%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\` or `...\\cline.cline\\`
- Cursor storage: macOS `$HOME/Library/Application Support/Cursor/User/globalStorage/` and `.../workspaceStorage/`; Linux `$HOME/.config/Cursor/User/globalStorage/` and `.../workspaceStorage/`; Windows `%APPDATA%\\Cursor\\User\\globalStorage\\` and `%APPDATA%\\Cursor\\User\\workspaceStorage\\`

These paths follow each app's standard user-data location conventions.

## Common tasks

### Adding a dependency

- Frontend: `npm install <pkg> -w @recall/desktop`
- Rust: edit `apps/desktop/src-tauri/Cargo.toml` by hand and `cargo build`.

### Bumping a frontend package across the workspace

Use `npm install <pkg>@<version> -w <workspace>` per workspace, or edit the relevant `package.json` files and run `npm install` once from the root.

### Toolchain pin

Rust is pinned to `stable` by the CI workflow. Locally, any recent stable works. If Tauri 2 requires a specific minimum, bump the toolchain in CI first, then update this doc.
