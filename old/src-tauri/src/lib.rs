mod connectors;
mod db;
mod indexer;
mod models;

use db::Database;
use indexer::Indexer;
use models::{ActivityPoint, ExportData, SearchResult, Session, SessionSummary};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

type AppResult<T> = Result<T, String>;
type SharedDb = Arc<Mutex<Option<Database>>>;

struct AppState {
    db: SharedDb,
}

#[derive(Serialize)]
struct DetectedSourcePayload {
    name: String,
    agent_slug: String,
    detected: bool,
    root_paths: Vec<String>,
    evidence: String,
}

#[derive(Serialize)]
struct AppInfoPayload {
    current_version: String,
    repository_url: String,
    releases_url: String,
}

const REPOSITORY_URL: &str = "https://github.com/akhshyganesh/recall";
const RELEASES_URL: &str = "https://github.com/akhshyganesh/recall/releases";

fn get_db_path() -> AppResult<PathBuf> {
    let data_dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_dir = data_dir.join("com.recall.app");
    std::fs::create_dir_all(&app_dir).map_err(|err| err.to_string())?;
    Ok(app_dir.join("recall.db"))
}

fn with_db<F, T>(state: &State<AppState>, f: F) -> AppResult<T>
where
    F: FnOnce(&Database) -> AppResult<T>,
{
    let guard = state.db.lock().map_err(|err| err.to_string())?;
    let db = guard
        .as_ref()
        .ok_or_else(|| "Database not initialized".to_string())?;
    f(db)
}

fn persist_scanned_sessions(db: SharedDb, since_ts: Option<String>) -> AppResult<usize> {
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
        Ok(total) => eprintln!("[recall] Initial scan complete: {} sessions indexed", total),
        Err(error) => eprintln!("[recall] Initial scan failed: {error}"),
    });
}

fn build_markdown_export(session: &Session) -> String {
    let mut markdown = String::new();

    markdown.push_str(&format!(
        "# {}\n\n",
        session.title.as_deref().unwrap_or("Untitled Session")
    ));
    markdown.push_str(&format!("**Tool:** {}\n", session.tool));

    if let Some(repo_path) = &session.repo_path {
        markdown.push_str(&format!("**Repository:** {}\n", repo_path));
    }

    if let Some(started_at) = &session.started_at {
        markdown.push_str(&format!("**Started:** {}\n", started_at));
    }

    markdown.push_str("\n---\n\n");

    for message in &session.messages {
        let role_label = match message.role.as_str() {
            "user" => "**You**",
            "assistant" => "**AI**",
            _ => &message.role,
        };

        markdown.push_str(&format!("### {}\n\n{}\n\n", role_label, message.content));
    }

    markdown
}

fn build_text_export(session: &Session) -> String {
    let mut text = String::new();

    text.push_str(&format!(
        "{}\n",
        session.title.as_deref().unwrap_or("Untitled Session")
    ));
    text.push_str(&format!("Tool: {}\n", session.tool));
    text.push_str("---\n\n");

    for message in &session.messages {
        text.push_str(&format!("[{}]: {}\n\n", message.role, message.content));
    }

    text
}

fn build_export_content(session: &Session, format: &str) -> AppResult<(String, &'static str)> {
    match format {
        "json" => Ok((
            serde_json::to_string_pretty(session).map_err(|err| err.to_string())?,
            "json",
        )),
        "markdown" | "md" => Ok((build_markdown_export(session), "md")),
        _ => Ok((build_text_export(session), "txt")),
    }
}

fn sanitize_filename_fragment(title: Option<&str>) -> String {
    title
        .unwrap_or("session")
        .chars()
        .take(30)
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect()
}

#[tauri::command]
fn detect_sources() -> AppResult<Vec<DetectedSourcePayload>> {
    let results = Indexer::detect_all();
    Ok(results
        .into_iter()
        .map(|(name, agent_slug, detection)| DetectedSourcePayload {
            name,
            agent_slug,
            detected: detection.detected,
            root_paths: detection.root_paths,
            evidence: detection.evidence,
        })
        .collect())
}

#[tauri::command]
fn get_app_info(app: AppHandle) -> AppInfoPayload {
    AppInfoPayload {
        current_version: app.package_info().version.to_string(),
        repository_url: REPOSITORY_URL.to_string(),
        releases_url: RELEASES_URL.to_string(),
    }
}

#[tauri::command]
async fn scan_all(state: State<'_, AppState>) -> AppResult<usize> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || persist_scanned_sessions(db, None))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn scan_incremental(
    state: State<'_, AppState>,
    since_ts: Option<String>,
) -> AppResult<usize> {
    let db = state.db.clone();
    tokio::task::spawn_blocking(move || persist_scanned_sessions(db, since_ts))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
fn get_sessions(
    state: State<AppState>,
    tool: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> AppResult<Vec<SessionSummary>> {
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
fn get_session(state: State<AppState>, id: String) -> AppResult<Option<models::Session>> {
    with_db(&state, |db| db.get_session(&id))
}

#[tauri::command]
fn search_sessions(
    state: State<AppState>,
    query: String,
    tools: Option<Vec<String>>,
    paths: Option<Vec<String>>,
    date_from: Option<String>,
    date_to: Option<String>,
    limit: Option<usize>,
) -> AppResult<Vec<SearchResult>> {
    with_db(&state, |db| {
        db.search(
            &query,
            tools.as_deref(),
            paths.as_deref(),
            date_from.as_deref(),
            date_to.as_deref(),
            limit.unwrap_or(50),
        )
    })
}

#[tauri::command]
fn toggle_favorite(state: State<AppState>, session_id: String) -> AppResult<bool> {
    with_db(&state, |db| db.toggle_favorite(&session_id))
}

#[tauri::command]
fn get_favorites(
    state: State<AppState>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> AppResult<Vec<SessionSummary>> {
    with_db(&state, |db| {
        db.get_favorites(limit.unwrap_or(50), offset.unwrap_or(0))
    })
}

#[tauri::command]
fn get_tools(state: State<AppState>) -> AppResult<Vec<String>> {
    with_db(&state, |db| db.get_tools())
}

#[tauri::command]
fn get_search_paths(state: State<AppState>) -> AppResult<Vec<String>> {
    with_db(&state, |db| db.get_search_paths())
}

#[tauri::command]
fn get_stats(state: State<AppState>) -> AppResult<serde_json::Value> {
    with_db(&state, |db| db.get_stats())
}

#[tauri::command]
fn get_activity_heatmap(
    state: State<AppState>,
    days: Option<usize>,
) -> AppResult<Vec<ActivityPoint>> {
    with_db(&state, |db| db.get_activity_heatmap(days.unwrap_or(182)))
}

#[tauri::command]
fn clear_database(state: State<AppState>) -> AppResult<()> {
    with_db(&state, |db| db.clear_all())
}

#[tauri::command]
fn export_session(
    state: State<AppState>,
    id: String,
    format: String,
) -> AppResult<ExportData> {
    with_db(&state, |db| {
        let session = db
            .get_session(&id)?
            .ok_or_else(|| "Session not found".to_string())?;
        let (content, extension) = build_export_content(&session, format.as_str())?;
        let filename = format!(
            "{}.{}",
            sanitize_filename_fragment(session.title.as_deref()),
            extension
        );

        Ok(ExportData {
            format,
            content,
            filename,
        })
    })
}

pub fn run() {
    let db_path = get_db_path().expect("Failed to create app data directory");
    let db = Database::new(&db_path).expect("Failed to initialize database");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            db: Arc::new(Mutex::new(Some(db))),
        })
        .setup(|app| {
            spawn_initial_scan(app.state::<AppState>().db.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            detect_sources,
            scan_all,
            scan_incremental,
            get_sessions,
            get_session,
            search_sessions,
            toggle_favorite,
            get_favorites,
            get_tools,
            get_search_paths,
            get_stats,
            get_activity_heatmap,
            clear_database,
            export_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
