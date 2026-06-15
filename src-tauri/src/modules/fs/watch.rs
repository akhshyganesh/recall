use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

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

const DEBOUNCE_QUIET: Duration = Duration::from_millis(150);
const DEBOUNCE_MAX: Duration = Duration::from_millis(1000);

fn is_skipped(path: &std::path::Path) -> bool {
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

/// Recursively collect all non-skipped directories under `root`.
fn collect_dirs(root: &std::path::Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if is_skipped(root) {
        return dirs;
    }
    dirs.push(root.to_path_buf());
    let Ok(entries) = std::fs::read_dir(root) else {
        return dirs;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && !path.is_symlink() {
            dirs.extend(collect_dirs(&path));
        }
    }
    dirs
}

type SharedWatcher = Arc<Mutex<Option<RecommendedWatcher>>>;
type SharedDirRefcount = Arc<Mutex<HashMap<PathBuf, usize>>>;

enum WatchMsg {
    Changed(PathBuf),
    /// A new directory was just created; watch it and its children.
    NewDir(PathBuf),
}

fn dispatch_loop(
    rx: mpsc::Receiver<WatchMsg>,
    app: AppHandle,
    watcher: SharedWatcher,
    dir_refcount: SharedDirRefcount,
) {
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
            Ok(WatchMsg::NewDir(dir)) => {
                // Walk first (potentially slow), then lock briefly.
                let dirs = collect_dirs(&dir);
                let mut rc = dir_refcount.lock().unwrap();
                let mut w = watcher.lock().unwrap();
                let Some(w) = w.as_mut() else { continue };
                for d in dirs {
                    let count = rc.entry(d.clone()).or_insert(0);
                    *count += 1;
                    if *count == 1 {
                        let _ = w.watch(&d, RecursiveMode::NonRecursive);
                    }
                }
                continue;
            }
            Ok(WatchMsg::Changed(path)) => {
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
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if pending.is_empty() {
                    continue;
                }
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

pub struct WatchState {
    inner: Arc<Mutex<WatchInner>>,
}

struct WatchInner {
    watcher: SharedWatcher,
    /// Root paths and their subscriber refcounts.
    refcount: HashMap<PathBuf, usize>,
    /// Every directory currently watched, with a refcount across all roots.
    /// Shared with the dispatch thread so it can add dynamic new-dir watches.
    dir_refcount: SharedDirRefcount,
    event_tx: Option<mpsc::SyncSender<WatchMsg>>,
}

impl Default for WatchState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(WatchInner {
                watcher: Arc::new(Mutex::new(None)),
                refcount: HashMap::new(),
                dir_refcount: Arc::new(Mutex::new(HashMap::new())),
                event_tx: None,
            })),
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

    if inner.event_tx.is_none() {
        let (tx, rx) = mpsc::sync_channel::<WatchMsg>(512);
        let tx_cb = tx.clone();
        inner.event_tx = Some(tx);

        let watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            let Ok(event) = res else { return };
            if !is_relevant_event(&event.kind) {
                return;
            }
            for path in &event.paths {
                if is_skipped(path) {
                    continue;
                }
                if matches!(event.kind, EventKind::Create(_)) && path.is_dir() {
                    let _ = tx_cb.try_send(WatchMsg::NewDir(path.clone()));
                } else {
                    let _ = tx_cb.try_send(WatchMsg::Changed(path.clone()));
                }
            }
        })
        .map_err(|e| e.to_string())?;

        *inner.watcher.lock().unwrap() = Some(watcher);

        let app_clone = app.clone();
        let watcher_clone = inner.watcher.clone();
        let dir_rc_clone = inner.dir_refcount.clone();
        std::thread::Builder::new()
            .name("recall-fs-watch".into())
            .spawn(move || dispatch_loop(rx, app_clone, watcher_clone, dir_rc_clone))
            .expect("spawn recall-fs-watch thread");
    }

    let canon = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let root_count = inner.refcount.entry(canon.clone()).or_insert(0);
    *root_count += 1;

    if *root_count == 1 {
        // Walk the tree before locking watcher/dir_refcount.
        let dirs = collect_dirs(&canon);
        log::info!(
            "fs_watch_add: watching {} dirs under {} (skipping excluded folders)",
            dirs.len(),
            canon.display()
        );
        let mut dir_rc = inner.dir_refcount.lock().unwrap();
        let mut watcher_guard = inner.watcher.lock().unwrap();
        let w = watcher_guard.as_mut().unwrap();
        for dir in &dirs {
            let count = dir_rc.entry(dir.clone()).or_insert(0);
            *count += 1;
            if *count == 1 {
                w.watch(dir, RecursiveMode::NonRecursive)
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn fs_watch_remove(state: tauri::State<'_, WatchState>, path: String) -> Result<(), String> {
    let mut inner = state.inner.lock().unwrap();

    let canon = match std::fs::canonicalize(&path) {
        Ok(p) => p,
        Err(_) => return Ok(()),
    };

    if let Some(count) = inner.refcount.get_mut(&canon) {
        *count = count.saturating_sub(1);
        if *count == 0 {
            inner.refcount.remove(&canon);

            // Unwatch every dir that is under this root.
            let mut dir_rc = inner.dir_refcount.lock().unwrap();
            let mut watcher_guard = inner.watcher.lock().unwrap();
            let to_remove: Vec<PathBuf> = dir_rc
                .keys()
                .filter(|d| d.starts_with(&canon))
                .cloned()
                .collect();
            for dir in to_remove {
                if let Some(count) = dir_rc.get_mut(&dir) {
                    *count = count.saturating_sub(1);
                    if *count == 0 {
                        dir_rc.remove(&dir);
                        if let Some(w) = watcher_guard.as_mut() {
                            let _ = w.unwatch(&dir);
                        }
                    }
                }
            }
            log::info!("fs_watch_remove: unwatched {}", canon.display());
        }
    }

    Ok(())
}
