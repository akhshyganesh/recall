# Security

Recall runs shells, reads/writes files, renders previews, and handles local workspace context — so security bugs matter. If you find one, please tell us before posting it publicly.

## Reporting

Use GitHub's private security reporting on the Recall repository. Include:

- What the issue is and what it lets an attacker do
- Steps to reproduce (a small PoC is great)
- Version, OS, arch

We'll get back to you within a few days. Once it's fixed, we'll credit you in the release notes — unless you'd rather stay anonymous.

Please **don't** open a public GitHub issue for security reports.

## Supported versions

Only the latest minor line gets security fixes. Right now that's `1.0.x`.

## What's in scope

- The Rust backend in `src-tauri/` (PTY, FS, IPC, plugins)
- The frontend in `src/` — anywhere untrusted input lands (terminal output, file content, preview content)
- Release artifacts on GitHub and the auto-update channel
- The auto-updater

## What's not

- Bugs in upstream deps (Tauri, xterm.js, CodeMirror, etc.) — report those upstream. We'll ship the fix once it's released.
- Anything that needs an already-compromised machine or a local attacker with shell access
- Older versions (`< 0.5`)

## What we do to keep things safe

- **No telemetry.** Recall only talks to the network when you ask it to (update checks, web preview).
- **No Node in the renderer.** The frontend only reaches the host through the allow-listed Tauri commands.
- **Signed releases.** Updates are verified before they're applied.

## What we can't promise

- Recall runs whatever you tell it to run, with your permissions. That's kind of the point of a terminal.
- Local previews and external URLs are only as trustworthy as the sites you point the app at.
