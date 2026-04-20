# Security Policy

## Threat model

Recall is a **read-only** indexer of local files created by other tools. Concretely:

- It scans directories under `$HOME` belonging to the AI assistants listed in [`README.md`](README.md).
- It reads session files, normalizes them, and writes a **copy** into a local SQLite database at `~/Library/Application Support/com.recall.app/recall.db` (macOS), `$XDG_DATA_HOME/com.recall.app/` (Linux), or the Windows equivalent.
- It **never** modifies any file it scans.
- It **never** makes an outbound network request except:
  - The optional update check (`GET https://api.github.com/repos/akhshyganesh/recall/releases/latest`), which is initiated explicitly by the user opening Settings, or on app boot.
  - The opener plugin, which launches external URLs **only** when the user clicks a button (release page, etc.).

There is no telemetry, no analytics, no authentication, no account.

## Reporting a vulnerability

If you discover a vulnerability — memory safety, path traversal in connector parsing, data exfiltration vector, etc. — please **do not** open a public issue.

Email: **security@akhshyganesh.dev** (or open a [private security advisory](https://github.com/akhshyganesh/recall/security/advisories/new) on GitHub).

Include:

- A description of the issue and its impact
- Steps to reproduce (ideally a minimal fixture)
- The version you tested (see *Settings → About*)
- Your preferred name/handle for disclosure credit (or request anonymity)

You can expect:

1. Acknowledgement within 72 hours.
2. An initial assessment within 7 days.
3. A coordinated fix + release for confirmed issues; CVE will be requested when warranted.

## Supported versions

Only the latest minor release on the `main` branch receives security fixes. Old releases remain available but are not patched.

## Hardening notes for contributors

- Treat every byte read from a session file as adversarial input. Use `serde_json::from_slice` with explicit types, not `Value::as_str().unwrap()`.
- Never pass user/session data to `std::process::Command` or a shell.
- Path validation: connectors must confine their filesystem reads to the tool's documented directory. No `..` traversal, no symlink escape outside `$HOME`.
- UI: `react-markdown` is rendered with `remark-gfm` only; raw HTML is disabled.
