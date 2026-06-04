use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

/// Directories whose contents are never interesting to watch.
static SKIP_BASENAMES: &[&str] = &[
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    ".pnpm",
    ".yarn",
    "bower_components",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "out",
    ".output",
    "__pycache__",
    ".mypy_cache",
    ".tox",
    ".venv",
    "venv",
    ".cargo",
    ".gradle",
    ".m2",
    "Pods",
    ".cocoapods",
    ".terraform",
];

/// After this quiet gap with no new events, flush the batch.
const DEBOUNCE_QUIET: Duration = Duration::from_millis(150);
/// After this much time, flush even if events keep arriving.
const DEBOUNCE_MAX: Duration = Duration::from_millis(1000);

pub struct WatchState {
    inner: Arc<Mutex<WatchInner>>,
}

struct WatchInner {
    watcher: Option<RecommendedWatcher>,
    /// How many frontend subscribers requested each path.
    refcount: HashMap<PathBuf, usize>,
    /// Sender to the debounce thread; None until the first fs_watch_add call.
    event_tx: Option<mpsc::SyncSender<PathBuf>>,
}

impl Default for WatchState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(WatchInner {
                watcher: None,
                refcount: HashMap::new(),
                event_tx: None,
            })),
        }
    }
}

fn is_skip_path(path: &std::path::Path) -> bool {
    path.components().any(|c| {
        if let std::path::Component::Normal(name) = c {
            SKIP_BASENAMES.contains(&name.to_string_lossy().as_ref())
        } else {
            false
        }
    })
}

fn is_relevant_event(kind: &EventKind) -> bool {
    !matches!(kind, EventKind::Access(_) | EventKind::Other)
}

fn debounce_loop(rx: mpsc::Receiver<PathBuf>, app: AppHandle) {
    let mut pending: Vec<PathBuf> = Vec::new();
    let mut first_at: Option<Instant> = None;

    loop {
        let timeout = match first_at {
            None => DEBOUNCE_QUIET,
            Some(t) => {
                let elapsed = t.elapsed();
                if elapsed >= DEBOUNCE_MAX {
                    Duration::ZERO
                } else {
                    DEBOUNCE_QUIET
                }
            }
        };

        match rx.recv_timeout(timeout) {
            Ok(path) => {
                if first_at.is_none() {
                    first_at = Some(Instant::now());
                }
                if !pending.contains(&path) {
                    pending.push(path);
                }
                let elapsed = first_at.map(|t| t.elapsed()).unwrap_or_default();
                if elapsed < DEBOUNCE_MAX {
                    continue;
                }
                // Max window exceeded — fall through to flush immediately.
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if pending.is_empty() {
                    continue;
                }
                // Quiet period elapsed with pending events — flush.
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        if !pending.is_empty() {
            let paths: Vec<String> = pending
                .drain(..)
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            first_at = None;
            let _ = app.emit("fs:changed", paths);
        }
    }
}

#[tauri::command]
pub fn fs_watch_add(
    app: AppHandle,
    state: tauri::State<'_, WatchState>,
    path: String,
) -> Result<(), String> {
    let mut inner = state.inner.lock().unwrap();

    // Lazy init: create the watcher and debounce thread on the first call.
    if inner.event_tx.is_none() {
        let (tx, rx) = mpsc::sync_channel::<PathBuf>(512);
        let tx_watcher = tx.clone();
        inner.event_tx = Some(tx);

        let watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            let Ok(event) = res else { return };
            if !is_relevant_event(&event.kind) {
                return;
            }
            for path in event.paths {
                if is_skip_path(&path) {
                    continue;
                }
                let _ = tx_watcher.try_send(path);
            }
        })
        .map_err(|e| e.to_string())?;

        inner.watcher = Some(watcher);

        let app_clone = app.clone();
        std::thread::Builder::new()
            .name("recall-fs-watch".into())
            .spawn(move || debounce_loop(rx, app_clone))
            .expect("spawn recall-fs-watch thread");
    }

    let canon = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let count = inner.refcount.entry(canon.clone()).or_insert(0);
    *count += 1;
    if *count == 1 {
        if let Some(w) = &mut inner.watcher {
            w.watch(&canon, RecursiveMode::Recursive)
                .map_err(|e| e.to_string())?;
            log::info!("fs_watch_add: watching {}", canon.display());
        }
    }

    Ok(())
}

#[tauri::command]
pub fn fs_watch_remove(
    state: tauri::State<'_, WatchState>,
    path: String,
) -> Result<(), String> {
    let mut inner = state.inner.lock().unwrap();

    let canon = match std::fs::canonicalize(&path) {
        Ok(p) => p,
        Err(_) => return Ok(()),
    };

    if let Some(count) = inner.refcount.get_mut(&canon) {
        *count = count.saturating_sub(1);
        if *count == 0 {
            inner.refcount.remove(&canon);
            if let Some(w) = &mut inner.watcher {
                let _ = w.unwatch(&canon);
                log::info!("fs_watch_remove: unwatched {}", canon.display());
            }
        }
    }

    Ok(())
}
