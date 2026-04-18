mod db;
mod models;
mod connectors;
mod indexer;

use db::Database;
use models::{SessionSummary, SearchResult, ExportData};
use indexer::Indexer;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, State};

struct AppState {
    db: Mutex<Option<Database>>,
    /// Set to true once the initial background scan completes
    initial_scan_done: AtomicBool,
    /// Timestamp of the last completed scan (RFC 3339)
    last_scan_ts: Mutex<Option<String>>,
}

fn get_db_path() -> PathBuf {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    let app_dir = data_dir.join("com.recall.app");
    std::fs::create_dir_all(&app_dir).ok();
    app_dir.join("recall.db")
}

fn with_db<F, T>(state: &State<AppState>, f: F) -> Result<T, String>
where
    F: FnOnce(&Database) -> Result<T, String>,
{
    let guard = state.db.lock().map_err(|e| e.to_string())?;
    let db = guard.as_ref().ok_or("Database not initialized")?;
    f(db)
}

#[tauri::command]
fn detect_sources() -> Result<Vec<serde_json::Value>, String> {
    let results = Indexer::detect_all();
    Ok(results.into_iter().map(|(name, slug, det)| {
        serde_json::json!({
            "name": name,
            "agent_slug": slug,
            "detected": det.detected,
            "root_paths": det.root_paths,
            "evidence": det.evidence,
        })
    }).collect())
}

#[tauri::command]
fn scan_all(state: State<AppState>) -> Result<usize, String> {
    let result = with_db(&state, |db| Indexer::scan_all(db, None))?;
    // Update last scan timestamp
    if let Ok(mut ts) = state.last_scan_ts.lock() {
        *ts = Some(chrono::Utc::now().to_rfc3339());
    }
    Ok(result)
}

#[tauri::command]
fn scan_incremental(state: State<AppState>, since_ts: Option<String>) -> Result<usize, String> {
    let result = with_db(&state, |db| Indexer::scan_all(db, since_ts.as_deref()))?;
    if let Ok(mut ts) = state.last_scan_ts.lock() {
        *ts = Some(chrono::Utc::now().to_rfc3339());
    }
    Ok(result)
}

/// Returns scan status: whether initial scan is done, last scan timestamp
#[tauri::command]
fn get_scan_status(state: State<AppState>) -> Result<serde_json::Value, String> {
    let initial_done = state.initial_scan_done.load(Ordering::Relaxed);
    let last_ts = state.last_scan_ts.lock()
        .map_err(|e| e.to_string())?
        .clone();
    Ok(serde_json::json!({
        "initial_scan_done": initial_done,
        "last_scan_ts": last_ts,
    }))
}

#[tauri::command]
fn get_sessions(
    state: State<AppState>,
    tool: Option<String>,
    repo: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<SessionSummary>, String> {
    with_db(&state, |db| {
        db.get_session_summaries(
            tool.as_deref(),
            repo.as_deref(),
            date_from.as_deref(),
            date_to.as_deref(),
            limit.unwrap_or(50),
            offset.unwrap_or(0),
        )
    })
}

#[tauri::command]
fn get_session(state: State<AppState>, id: String) -> Result<Option<models::Session>, String> {
    with_db(&state, |db| db.get_session(&id))
}

#[tauri::command]
fn search_sessions(
    state: State<AppState>,
    query: String,
    tool: Option<String>,
    repo: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    with_db(&state, |db| {
        db.search(
            &query,
            tool.as_deref(),
            repo.as_deref(),
            date_from.as_deref(),
            date_to.as_deref(),
            limit.unwrap_or(50),
        )
    })
}

#[tauri::command]
fn toggle_favorite(state: State<AppState>, session_id: String) -> Result<bool, String> {
    with_db(&state, |db| db.toggle_favorite(&session_id))
}

#[tauri::command]
fn get_favorites(state: State<AppState>, limit: Option<usize>, offset: Option<usize>) -> Result<Vec<SessionSummary>, String> {
    with_db(&state, |db| db.get_favorites(limit.unwrap_or(50), offset.unwrap_or(0)))
}

#[tauri::command]
fn get_tools(state: State<AppState>) -> Result<Vec<String>, String> {
    with_db(&state, |db| db.get_tools())
}

#[tauri::command]
fn get_repos(state: State<AppState>) -> Result<Vec<String>, String> {
    with_db(&state, |db| db.get_repos())
}

#[tauri::command]
fn get_stats(state: State<AppState>) -> Result<serde_json::Value, String> {
    with_db(&state, |db| db.get_stats())
}

#[tauri::command]
fn delete_session(state: State<AppState>, id: String) -> Result<(), String> {
    with_db(&state, |db| db.delete_session(&id))
}

#[tauri::command]
fn clear_database(state: State<AppState>) -> Result<(), String> {
    with_db(&state, |db| db.clear_all())
}

#[tauri::command]
fn export_session(state: State<AppState>, id: String, format: String) -> Result<ExportData, String> {
    with_db(&state, |db| {
        let session = db.get_session(&id)?.ok_or("Session not found")?;
        let (content, ext) = match format.as_str() {
            "json" => {
                (serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?, "json")
            }
            "markdown" | "md" => {
                let mut md = String::new();
                md.push_str(&format!("# {}\n\n", session.title.as_deref().unwrap_or("Untitled Session")));
                md.push_str(&format!("**Tool:** {}\n", session.tool));
                if let Some(ref repo) = session.repo_path {
                    md.push_str(&format!("**Repository:** {}\n", repo));
                }
                if let Some(ref started) = session.started_at {
                    md.push_str(&format!("**Started:** {}\n", started));
                }
                md.push_str("\n---\n\n");
                for msg in &session.messages {
                    let role_label = match msg.role.as_str() {
                        "user" => "**You**",
                        "assistant" => "**AI**",
                        _ => &msg.role,
                    };
                    md.push_str(&format!("### {}\n\n{}\n\n", role_label, msg.content));
                }
                (md, "md")
            }
            _ => {
                // Plain text
                let mut txt = String::new();
                txt.push_str(&format!("{}\n", session.title.as_deref().unwrap_or("Untitled Session")));
                txt.push_str(&format!("Tool: {}\n", session.tool));
                txt.push_str(&format!("---\n\n"));
                for msg in &session.messages {
                    txt.push_str(&format!("[{}]: {}\n\n", msg.role, msg.content));
                }
                (txt, "txt")
            }
        };

        let title_slug = session.title.as_deref().unwrap_or("session")
            .chars().take(30)
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>();
        let filename = format!("{}.{}", title_slug, ext);

        Ok(ExportData { format: format.clone(), content, filename })
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = get_db_path();
    let db = Database::new(&db_path).expect("Failed to initialize database");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            db: Mutex::new(Some(db)),
            initial_scan_done: AtomicBool::new(false),
            last_scan_ts: Mutex::new(None),
        })
        .setup(|app| {
            // Run initial full scan in background thread on app launch
            let state = app.state::<AppState>();
            let db_guard = state.db.lock().map_err(|e| e.to_string())?;
            if let Some(db) = db_guard.as_ref() {
                // Do a quick initial scan — this populates the timeline immediately
                match Indexer::scan_all(db, None) {
                    Ok(count) => {
                        eprintln!("[recall] Initial scan complete: {} sessions indexed", count);
                        state.initial_scan_done.store(true, Ordering::Relaxed);
                        if let Ok(mut ts) = state.last_scan_ts.lock() {
                            *ts = Some(chrono::Utc::now().to_rfc3339());
                        }
                    }
                    Err(e) => {
                        eprintln!("[recall] Initial scan failed: {}", e);
                        // Still mark as done so UI doesn't wait forever
                        state.initial_scan_done.store(true, Ordering::Relaxed);
                    }
                }
            }
            drop(db_guard);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_sources,
            scan_all,
            scan_incremental,
            get_scan_status,
            get_sessions,
            get_session,
            search_sessions,
            toggle_favorite,
            get_favorites,
            get_tools,
            get_repos,
            get_stats,
            delete_session,
            clear_database,
            export_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
