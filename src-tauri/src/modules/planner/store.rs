use std::path::PathBuf;

use rusqlite::{params, types::Type, Connection, OptionalExtension, Transaction};
use serde::{de::DeserializeOwned, Serialize};

use crate::modules::planner::models::{
    now_timestamp, PlannerAccessPolicy, PlannerDocument, PlannerItem, PlannerSettings,
    PlannerSketch, PlannerSketchFolder, PlannerTimerState,
};
use crate::modules::planner::AppResult;

const PLANNER_FILE_NAME: &str = "planner.json";
const PLANNER_DB_FILE_NAME: &str = "planner.sqlite3";

pub fn read_document() -> AppResult<PlannerDocument> {
    migrate_json_document_if_needed()?;
    let conn = open_connection()?;
    read_document_from_connection(&conn)
}

pub fn write_document(mut document: PlannerDocument) -> AppResult<PlannerDocument> {
    document.schema_version = 1;
    document.updated_at = now_timestamp();

    let mut conn = open_connection()?;
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    replace_document(&tx, &document)?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(document)
}

fn read_document_from_connection(conn: &Connection) -> AppResult<PlannerDocument> {
    let fallback = PlannerDocument::default();
    let schema_version = read_meta_json(conn, "schema_version", fallback.schema_version)?;
    let updated_at = read_meta_json(conn, "updated_at", fallback.updated_at)?;
    let settings = read_meta_json(conn, "settings", PlannerSettings::default())?;
    let access_policy = read_meta_json(conn, "access_policy", PlannerAccessPolicy::default())?;
    let items = read_items(conn)?;
    let sketches = read_sketches(conn)?;
    let sketch_folders = read_sketch_folders(conn)?;
    let sketch = sketches.first().cloned().unwrap_or_default();

    Ok(PlannerDocument {
        schema_version,
        updated_at,
        items,
        sketch,
        sketches: if sketches.is_empty() {
            vec![PlannerSketch::default()]
        } else {
            sketches
        },
        sketch_folders,
        settings,
        access_policy,
    })
}

fn replace_document(tx: &Transaction<'_>, document: &PlannerDocument) -> AppResult<()> {
    tx.execute("DELETE FROM planner_meta", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM planner_items", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM planner_sketches", [])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM planner_sketch_folders", [])
        .map_err(|error| error.to_string())?;

    write_meta(tx, "schema_version", &document.schema_version)?;
    write_meta(tx, "updated_at", &document.updated_at)?;
    write_meta(tx, "settings", &document.settings)?;
    write_meta(tx, "access_policy", &document.access_policy)?;

    for (position, item) in document.items.iter().enumerate() {
        write_item(tx, position as i64, item)?;
    }
    for (position, sketch) in visible_document_sketches(document).iter().enumerate() {
        write_sketch(tx, position as i64, sketch)?;
    }
    for (position, folder) in document.sketch_folders.iter().enumerate() {
        write_sketch_folder(tx, position as i64, folder)?;
    }

    Ok(())
}

fn write_item(tx: &Transaction<'_>, position: i64, item: &PlannerItem) -> AppResult<()> {
    let tags_json = to_json(&item.tags)?;
    let timer_json = to_json(&item.timer)?;
    tx.execute(
        "INSERT OR REPLACE INTO planner_items (
            id, position, title, status, priority, notes, start_date, deadline, tags_json,
            estimate_minutes, created_at, updated_at, completed_at, archived_at, timer_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            item.id,
            position,
            item.title,
            item.status,
            item.priority,
            item.notes,
            item.start_date,
            item.deadline,
            tags_json,
            item.estimate_minutes,
            item.created_at,
            item.updated_at,
            item.completed_at,
            item.archived_at,
            timer_json,
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn write_sketch(tx: &Transaction<'_>, position: i64, sketch: &PlannerSketch) -> AppResult<()> {
    let tags_json = to_json(&sketch.tags)?;
    let snapshot_json = sketch.snapshot.as_ref().map(to_json).transpose()?;
    tx.execute(
        "INSERT OR REPLACE INTO planner_sketches (
            id, position, title, folder_id, linked_item_id, tags_json, updated_at, shape_count, snapshot_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            sketch.id,
            position,
            sketch.title,
            sketch.folder_id,
            sketch.linked_item_id,
            tags_json,
            sketch.updated_at,
            sketch.shape_count,
            snapshot_json,
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn write_sketch_folder(
    tx: &Transaction<'_>,
    position: i64,
    folder: &PlannerSketchFolder,
) -> AppResult<()> {
    tx.execute(
        "INSERT OR REPLACE INTO planner_sketch_folders (id, position, title, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![folder.id, position, folder.title, folder.created_at],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn write_meta<T: Serialize + ?Sized>(tx: &Transaction<'_>, key: &str, value: &T) -> AppResult<()> {
    let json = to_json(value)?;
    tx.execute(
        "INSERT OR REPLACE INTO planner_meta (key, value) VALUES (?1, ?2)",
        params![key, json],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn read_items(conn: &Connection) -> AppResult<Vec<PlannerItem>> {
    let mut statement = conn
        .prepare(
            "SELECT
                id, title, status, priority, notes, start_date, deadline, tags_json,
                estimate_minutes, created_at, updated_at, completed_at, archived_at, timer_json
             FROM planner_items
             ORDER BY CASE WHEN archived_at IS NULL THEN 0 ELSE 1 END, position ASC, updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let tags_json: String = row.get(7)?;
            let timer_json: String = row.get(13)?;
            Ok(PlannerItem {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                priority: row.get(3)?,
                notes: row.get(4)?,
                start_date: row.get(5)?,
                deadline: row.get(6)?,
                tags: from_json_column(&tags_json)?,
                estimate_minutes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                completed_at: row.get(11)?,
                archived_at: row.get(12)?,
                timer: from_json_column::<PlannerTimerState>(&timer_json)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn read_sketches(conn: &Connection) -> AppResult<Vec<PlannerSketch>> {
    let mut statement = conn
        .prepare(
            "SELECT id, title, folder_id, linked_item_id, tags_json, updated_at, shape_count, snapshot_json
             FROM planner_sketches
             ORDER BY position ASC, updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let tags_json: String = row.get(4)?;
            let snapshot_json: Option<String> = row.get(7)?;
            let snapshot = snapshot_json
                .as_deref()
                .map(from_json_column::<serde_json::Value>)
                .transpose()?;
            Ok(PlannerSketch {
                id: row.get(0)?,
                title: row.get(1)?,
                folder_id: row.get(2)?,
                linked_item_id: row.get(3)?,
                tags: from_json_column(&tags_json)?,
                updated_at: row.get(5)?,
                shape_count: row.get(6)?,
                snapshot,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn read_sketch_folders(conn: &Connection) -> AppResult<Vec<PlannerSketchFolder>> {
    let mut statement = conn
        .prepare(
            "SELECT id, title, created_at
             FROM planner_sketch_folders
             ORDER BY position ASC, created_at ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(PlannerSketchFolder {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn read_meta_json<T>(conn: &Connection, key: &str, fallback: T) -> AppResult<T>
where
    T: DeserializeOwned,
{
    let json: Option<String> = conn
        .query_row(
            "SELECT value FROM planner_meta WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    match json {
        Some(value) => serde_json::from_str(&value).map_err(|error| error.to_string()),
        None => Ok(fallback),
    }
}

fn open_connection() -> AppResult<Connection> {
    let path = planner_db_path()?;
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| error.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|error| error.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    init_tables(&conn)?;
    Ok(conn)
}

fn init_tables(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS planner_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS planner_items (
            id TEXT PRIMARY KEY,
            position INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            priority TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            start_date TEXT,
            deadline TEXT,
            tags_json TEXT NOT NULL DEFAULT '[]',
            estimate_minutes INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT,
            archived_at TEXT,
            timer_json TEXT NOT NULL DEFAULT '{"totalSeconds":0,"runningSince":null,"sessions":[]}'
        );

        CREATE TABLE IF NOT EXISTS planner_sketches (
            id TEXT PRIMARY KEY,
            position INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            folder_id TEXT,
            linked_item_id TEXT,
            tags_json TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT,
            shape_count INTEGER NOT NULL DEFAULT 0,
            snapshot_json TEXT
        );

        CREATE TABLE IF NOT EXISTS planner_sketch_folders (
            id TEXT PRIMARY KEY,
            position INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_planner_items_archived_at ON planner_items(archived_at);
        CREATE INDEX IF NOT EXISTS idx_planner_items_status ON planner_items(status);
        CREATE INDEX IF NOT EXISTS idx_planner_items_priority ON planner_items(priority);
        CREATE INDEX IF NOT EXISTS idx_planner_items_deadline ON planner_items(deadline);
        CREATE INDEX IF NOT EXISTS idx_planner_items_updated_at ON planner_items(updated_at);
        CREATE INDEX IF NOT EXISTS idx_planner_sketches_folder ON planner_sketches(folder_id);
        CREATE INDEX IF NOT EXISTS idx_planner_sketches_linked_item ON planner_sketches(linked_item_id);
        "#,
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn migrate_json_document_if_needed() -> AppResult<()> {
    let db_path = planner_db_path()?;
    if db_path.exists() {
        return Ok(());
    }

    let json_path = planner_json_path()?;
    if !json_path.exists() {
        return Ok(());
    }

    let text = std::fs::read_to_string(&json_path).map_err(|error| error.to_string())?;
    let document: PlannerDocument = serde_json::from_str(&text).map_err(|error| {
        format!(
            "Failed to parse planner data at {}: {error}",
            json_path.to_string_lossy()
        )
    })?;
    write_document(document)?;
    let migrated_path = json_path.with_extension("json.migrated");
    let _ = std::fs::rename(&json_path, migrated_path);
    Ok(())
}

fn visible_document_sketches(document: &PlannerDocument) -> Vec<PlannerSketch> {
    if document.sketches.is_empty() {
        vec![document.sketch.clone()]
    } else {
        document.sketches.clone()
    }
}

fn to_json<T: Serialize + ?Sized>(value: &T) -> AppResult<String> {
    serde_json::to_string(value).map_err(|error| error.to_string())
}

fn from_json_column<T: DeserializeOwned>(value: &str) -> rusqlite::Result<T> {
    serde_json::from_str(value)
        .map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, Type::Text, Box::new(error)))
}

fn planner_db_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join(PLANNER_DB_FILE_NAME))
}

fn planner_json_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join(PLANNER_FILE_NAME))
}

fn app_data_dir() -> AppResult<PathBuf> {
    let data_dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_dir = data_dir.join("com.recall.app");
    std::fs::create_dir_all(&app_dir).map_err(|error| error.to_string())?;
    Ok(app_dir)
}
