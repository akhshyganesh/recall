//! Recall — local AI coding session history indexer.
//!
//! This crate is the Tauri backend for the desktop app. Its public surface
//! is a single [`run`] entrypoint that boots the Tauri runtime; everything
//! else is structured into small modules:
//!
//! | Module        | Responsibility                                        |
//! |---------------|-------------------------------------------------------|
//! | [`db`]        | SQLite schema, FTS5 search, upserts, favorites, stats |
//! | [`indexer`]   | Connector orchestration + normalization → DB          |
//! | [`models`]    | Wire-format types shared with the frontend (ts-rs)    |
//! | [`connectors`]| Per-tool session scrapers (claude, copilot, cursor…)  |
//! | [`commands`]  | `#[tauri::command]` handlers                          |
//! | [`exports`]   | Markdown/JSON/text export builders                    |
//!
//! See `docs/architecture.md` for a deeper walkthrough.

mod commands;
mod connectors;
mod db;
mod exports;
mod indexer;
mod models;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{Manager, State};

use db::Database;
use indexer::Indexer;

pub(crate) type AppResult<T> = Result<T, String>;
pub(crate) type SharedDb = Arc<Mutex<Option<Database>>>;

pub struct AppState {
    pub(crate) db: SharedDb,
}

/// Resolve the SQLite database path under the per-user app data directory.
///
/// The directory is created on first run. The identifier
/// `com.recall.app` is kept stable for backwards compatibility with
/// existing installations.
fn get_db_path() -> AppResult<PathBuf> {
    let data_dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_dir = data_dir.join("com.recall.app");
    std::fs::create_dir_all(&app_dir).map_err(|err| err.to_string())?;
    Ok(app_dir.join("recall.db"))
}

/// Run `f` with a borrowed reference to the initialized [`Database`].
pub(crate) fn with_db<F, T>(state: &State<AppState>, f: F) -> AppResult<T>
where
    F: FnOnce(&Database) -> AppResult<T>,
{
    let guard = state.db.lock().map_err(|err| err.to_string())?;
    let db = guard
        .as_ref()
        .ok_or_else(|| "Database not initialized".to_string())?;
    f(db)
}

/// Run every connector (optionally filtered to sessions newer than
/// `since_ts`) and upsert each resulting [`crate::models::Session`] into
/// the database. Returns the number of sessions persisted.
pub(crate) fn persist_scanned_sessions(
    db: SharedDb,
    since_ts: Option<String>,
) -> AppResult<usize> {
    let receiver = Indexer::collect_sessions(since_ts.as_deref());
    let mut total = 0usize;

    for session in receiver {
        let guard = db.lock().map_err(|err| err.to_string())?;
        let database = guard
            .as_ref()
            .ok_or_else(|| "Database not initialized".to_string())?;
        database.upsert_session(&session)?;
        drop(guard);
        total += 1;
    }

    Ok(total)
}

fn spawn_initial_scan(db: SharedDb) {
    std::thread::spawn(move || match persist_scanned_sessions(db, None) {
        Ok(total) => eprintln!("[recall] Initial scan complete: {total} sessions indexed"),
        Err(error) => eprintln!("[recall] Initial scan failed: {error}"),
    });
}

/// Boot the Tauri runtime. Called from `main.rs`.
pub fn run() {
    let db_path = get_db_path().expect("Failed to create app data directory");
    let db = Database::new(&db_path).expect("Failed to initialize database");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            db: Arc::new(Mutex::new(Some(db))),
        })
        .setup(|app| {
            spawn_initial_scan(Arc::clone(&app.state::<AppState>().db));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::detect_sources,
            commands::scan_all,
            commands::scan_incremental,
            commands::get_sessions,
            commands::get_session,
            commands::search_sessions,
            commands::toggle_favorite,
            commands::get_favorites,
            commands::get_tools,
            commands::get_search_paths,
            commands::get_stats,
            commands::get_activity_heatmap,
            commands::clear_database,
            commands::export_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
