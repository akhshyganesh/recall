mod db;
mod models;
mod connectors;
mod indexer;

use db::Database;
use models::{SessionSummary, SearchResult, ExportData};
use indexer::Indexer;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

struct AppState {
    db: Arc<Mutex<Option<Database>>>,
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
async fn scan_all(state: State<'_, AppState>) -> Result<usize, String> {
    let db_arc = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let rx = Indexer::collect_sessions(None);
        let mut total = 0usize;
        for session in rx {
            let guard = db_arc.lock().map_err(|e| e.to_string())?;
            let db = guard.as_ref().ok_or("Database not initialized")?;
            db.upsert_session(&session)?;
            drop(guard);
            total += 1;
        }
        Ok(total)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_incremental(state: State<'_, AppState>, since_ts: Option<String>) -> Result<usize, String> {
    let db_arc = state.db.clone();
    tokio::task::spawn_blocking(move || {
        let rx = Indexer::collect_sessions(since_ts.as_deref());
        let mut total = 0usize;
        for session in rx {
            let guard = db_arc.lock().map_err(|e| e.to_string())?;
            let db = guard.as_ref().ok_or("Database not initialized")?;
            db.upsert_session(&session)?;
            drop(guard);
            total += 1;
        }
        Ok(total)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_sessions(
    state: State<AppState>,
    tool: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<SessionSummary>, String> {
    with_db(&state, |db| {
        db.get_session_summaries(
            tool.as_deref(),
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
    date_from: Option<String>,
    date_to: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    with_db(&state, |db| {
        db.search(
            &query,
            tool.as_deref(),
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
fn get_stats(state: State<AppState>) -> Result<serde_json::Value, String> {
    with_db(&state, |db| db.get_stats())
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

pub fn run() {
    let db_path = get_db_path();
    let db = Database::new(&db_path).expect("Failed to initialize database");

    tauri::Builder::default()
        .manage(AppState {
            db: Arc::new(Mutex::new(Some(db))),
        })
        .setup(|app| {
            let db_arc = app.state::<AppState>().db.clone();
            // Run initial scan in background so the window appears immediately
            std::thread::spawn(move || {
                let rx = Indexer::collect_sessions(None);
                let mut total = 0usize;
                for session in rx {
                    if let Ok(guard) = db_arc.lock() {
                        if let Some(db) = guard.as_ref() {
                            if db.upsert_session(&session).is_ok() {
                                total += 1;
                            }
                        }
                    }
                }
                eprintln!("[recall] Initial scan complete: {} sessions indexed", total);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_sources,
            scan_all,
            scan_incremental,
            get_sessions,
            get_session,
            search_sessions,
            toggle_favorite,
            get_favorites,
            get_tools,
            get_stats,
            clear_database,
            export_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
