//! Transport-only LSP server process manager.
//!
//! Spawns language-server processes and shuttles Content-Length-framed
//! JSON-RPC between the webview and the server's stdio. No LSP protocol
//! logic lives here — the frontend owns initialize/requests/notifications.
//!
//! Events emitted to the webview:
//! - `lsp:message:{session_id}` — payload is the raw JSON text of one message.
//! - `lsp:exit:{session_id}`    — payload is the exit code (or null).

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio_util::sync::CancellationToken;

use crate::modules::workspace::{authorize_spawn_cwd, WorkspaceEnv, WorkspaceRegistry};

struct LspSession {
    stdin: Arc<tokio::sync::Mutex<ChildStdin>>,
    cancel: CancellationToken,
    server_id: String,
}

#[derive(Default)]
pub struct LspState {
    sessions: Mutex<HashMap<u32, Arc<LspSession>>>,
    // Starts at 0 but fetch_add returns post-increment from 1 via `+ 1` below;
    // mirror PtyState: never hand out 0, which the frontend treats as "unset".
    next_id: AtomicU32,
}

impl LspState {
    fn insert(&self, session: Arc<LspSession>) -> u32 {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        self.sessions
            .lock()
            .expect("lsp sessions poisoned")
            .insert(id, session);
        id
    }

    fn remove(&self, id: u32) -> Option<Arc<LspSession>> {
        self.sessions
            .lock()
            .expect("lsp sessions poisoned")
            .remove(&id)
    }

    fn get(&self, id: u32) -> Option<Arc<LspSession>> {
        self.sessions
            .lock()
            .expect("lsp sessions poisoned")
            .get(&id)
            .cloned()
    }

    /// Kill every running language server. Called on app exit so children
    /// never outlive the host process (mirrors the pty module's cleanup).
    pub fn shutdown_all(&self) {
        let sessions = std::mem::take(&mut *self.sessions.lock().expect("lsp sessions poisoned"));
        for (id, session) in sessions {
            log::info!("lsp shutdown id={id} server={}", session.server_id);
            session.cancel.cancel();
        }
    }
}

/// Extract one `Content-Length`-framed message from `buf`. Returns the JSON
/// payload and the total number of bytes consumed (headers + body).
fn try_extract_frame(buf: &[u8]) -> Result<Option<(String, usize)>, String> {
    let Some(header_end) = buf.windows(4).position(|w| w == b"\r\n\r\n") else {
        return Ok(None);
    };
    let headers = std::str::from_utf8(&buf[..header_end])
        .map_err(|_| "non-UTF-8 LSP header".to_string())?;
    let mut content_length: Option<usize> = None;
    for line in headers.split("\r\n") {
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-length") {
                content_length = Some(
                    value
                        .trim()
                        .parse::<usize>()
                        .map_err(|e| format!("bad Content-Length: {e}"))?,
                );
            }
        }
    }
    let len = content_length.ok_or_else(|| "missing Content-Length header".to_string())?;
    let body_start = header_end + 4;
    if buf.len() < body_start + len {
        return Ok(None);
    }
    let body = String::from_utf8_lossy(&buf[body_start..body_start + len]).into_owned();
    Ok(Some((body, body_start + len)))
}

async fn read_stdout_frames(mut stdout: ChildStdout, app: tauri::AppHandle, id: u32) {
    let event = format!("lsp:message:{id}");
    let mut buf: Vec<u8> = Vec::with_capacity(16 * 1024);
    let mut chunk = [0u8; 16 * 1024];
    loop {
        match stdout.read(&mut chunk).await {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                loop {
                    match try_extract_frame(&buf) {
                        Ok(Some((message, consumed))) => {
                            buf.drain(..consumed);
                            if let Err(e) = app.emit(&event, message) {
                                log::debug!("lsp emit failed id={id}: {e}");
                            }
                        }
                        Ok(None) => break,
                        Err(e) => {
                            log::warn!("lsp framing error id={id}: {e}; dropping stream");
                            return;
                        }
                    }
                }
            }
            Err(e) => {
                log::debug!("lsp stdout read ended id={id}: {e}");
                break;
            }
        }
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn lsp_start(
    server_id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
    workspace: Option<WorkspaceEnv>,
    state: tauri::State<'_, LspState>,
    registry: tauri::State<'_, WorkspaceRegistry>,
    app: tauri::AppHandle,
) -> Result<u32, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let canonical_cwd = authorize_spawn_cwd(&registry, Some(&cwd), &workspace)
        .map_err(|e| {
            log::warn!("lsp_start: cwd rejected: {e}");
            e
        })?
        .ok_or_else(|| "cwd is required".to_string())?;

    let mut child: Child = tokio::process::Command::new(&command)
        .args(&args)
        .current_dir(&canonical_cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Backstop: if a session Arc is dropped without an explicit
        // lsp_stop, kill the server rather than leaking it.
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("failed to spawn {command}: {e}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to capture stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture stderr".to_string())?;

    let cancel = CancellationToken::new();
    let session = Arc::new(LspSession {
        stdin: Arc::new(tokio::sync::Mutex::new(stdin)),
        cancel: cancel.clone(),
        server_id: server_id.clone(),
    });
    let id = state.insert(session);
    log::info!(
        "lsp started id={id} server={server_id} command={command} cwd={}",
        canonical_cwd.display()
    );

    // Reader task: stdout frames -> webview events.
    let reader_app = app.clone();
    let reader = tauri::async_runtime::spawn(async move {
        read_stdout_frames(stdout, reader_app, id).await;
    });

    // Stderr task: log at debug level.
    let server_id_err = server_id.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::debug!("lsp stderr id={id} server={server_id_err}: {line}");
        }
    });

    // Waiter task: owns the child; kills it on cancellation, emits exit.
    tauri::async_runtime::spawn(async move {
        let code: Option<i32> = tokio::select! {
            status = child.wait() => match status {
                Ok(s) => s.code(),
                Err(e) => {
                    log::warn!("lsp wait failed id={id}: {e}");
                    None
                }
            },
            _ = cancel.cancelled() => {
                if let Err(e) = child.kill().await {
                    log::debug!("lsp kill id={id}: {e}");
                }
                child.wait().await.ok().and_then(|s| s.code())
            }
        };
        // Let the reader drain any final output before announcing the exit.
        let _ = reader.await;
        log::info!("lsp exited id={id} server={server_id} code={code:?}");
        if let Err(e) = app.emit(&format!("lsp:exit:{id}"), code) {
            log::debug!("lsp exit emit failed id={id}: {e}");
        }
        // Drop the session if the process died on its own (no lsp_stop).
        if let Some(state) = app.try_state::<LspState>() {
            state.remove(id);
        }
    });

    Ok(id)
}

#[tauri::command]
pub async fn lsp_send(
    session_id: u32,
    message: String,
    state: tauri::State<'_, LspState>,
) -> Result<(), String> {
    let session = state.get(session_id).ok_or_else(|| {
        log::warn!("lsp_send: unknown id={session_id}");
        "no session".to_string()
    })?;
    let framed = format!("Content-Length: {}\r\n\r\n{}", message.len(), message);
    let mut stdin = session.stdin.lock().await;
    stdin.write_all(framed.as_bytes()).await.map_err(|e| {
        // EPIPE is expected if the server already exited.
        log::debug!("lsp_send id={session_id} failed: {e}");
        e.to_string()
    })?;
    stdin.flush().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lsp_stop(session_id: u32, state: tauri::State<'_, LspState>) -> Result<(), String> {
    if let Some(session) = state.remove(session_id) {
        log::info!("lsp stopping id={session_id} server={}", session.server_id);
        session.cancel.cancel();
    } else {
        log::debug!("lsp_stop: unknown id={session_id}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_single_frame() {
        let raw = b"Content-Length: 13\r\n\r\n{\"jsonrpc\":2}";
        let (msg, consumed) = try_extract_frame(raw).unwrap().unwrap();
        assert_eq!(msg, "{\"jsonrpc\":2}");
        assert_eq!(consumed, raw.len());
    }

    #[test]
    fn waits_for_full_body() {
        let raw = b"Content-Length: 100\r\n\r\n{\"partial\":";
        assert!(try_extract_frame(raw).unwrap().is_none());
    }

    #[test]
    fn waits_for_header_terminator() {
        assert!(try_extract_frame(b"Content-Length: 5\r\n").unwrap().is_none());
    }

    #[test]
    fn handles_extra_headers_case_insensitive() {
        let raw = b"content-length: 2\r\nContent-Type: application/vscode-jsonrpc\r\n\r\n{}extra";
        let (msg, consumed) = try_extract_frame(raw).unwrap().unwrap();
        assert_eq!(msg, "{}");
        assert_eq!(consumed, raw.len() - "extra".len());
    }

    #[test]
    fn rejects_missing_content_length() {
        assert!(try_extract_frame(b"Content-Type: foo\r\n\r\n{}").is_err());
    }
}
