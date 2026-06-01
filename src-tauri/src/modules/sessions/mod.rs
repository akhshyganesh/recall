pub mod commands;
mod connectors;
mod db;
mod exports;
mod indexer;
mod mcp;
pub mod models;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::State;

use db::Database;

pub(crate) type AppResult<T> = Result<T, String>;
pub(crate) type SharedDb = Arc<Mutex<Option<Database>>>;

pub struct AppState {
    pub(crate) db: SharedDb,
    pub(crate) mcp: mcp::McpServerState,
}

impl AppState {
    pub fn new() -> AppResult<Self> {
        let db_path = get_db_path()?;
        let db = Database::new(&db_path)?;

        Ok(Self {
            db: Arc::new(Mutex::new(Some(db))),
            mcp: mcp::McpServerState::default(),
        })
    }

    pub(crate) fn db_handle(&self) -> SharedDb {
        Arc::clone(&self.db)
    }
}

fn get_db_path() -> AppResult<PathBuf> {
    let data_dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_dir = data_dir.join("com.recall.app");
    std::fs::create_dir_all(&app_dir).map_err(|err| err.to_string())?;
    Ok(app_dir.join("recall.db"))
}

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

pub(crate) fn persist_scanned_sessions(db: SharedDb, since_ts: Option<String>) -> AppResult<usize> {
    let receiver = indexer::Indexer::collect_sessions(since_ts.as_deref());
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

pub fn spawn_initial_scan(db: SharedDb) {
    std::thread::spawn(move || match persist_scanned_sessions(db, None) {
        Ok(total) => log::info!("Recall initial scan complete: {total} sessions indexed"),
        Err(error) => log::warn!("Recall initial scan failed: {error}"),
    });
}
