use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::models::{Session, Message, FileChange, SessionSummary, SearchResult};

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &PathBuf) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                tool TEXT NOT NULL,
                agent_slug TEXT NOT NULL,
                source_path TEXT,
                repo_name TEXT,
                repo_path TEXT,
                branch TEXT,
                title TEXT,
                started_at TEXT,
                ended_at TEXT,
                model TEXT,
                message_count INTEGER DEFAULT 0,
                file_count INTEGER DEFAULT 0,
                workspace TEXT,
                external_id TEXT,
                metadata TEXT DEFAULT '{}',
                indexed_at TEXT NOT NULL,
                source_mtime TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                idx INTEGER NOT NULL,
                role TEXT NOT NULL,
                author TEXT,
                content TEXT NOT NULL,
                created_at TEXT,
                extra TEXT DEFAULT '{}',
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS file_changes (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                path TEXT NOT NULL,
                additions INTEGER DEFAULT 0,
                deletions INTEGER DEFAULT 0,
                diff_text TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS favorites (
                session_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS scan_sources (
                id TEXT PRIMARY KEY,
                tool TEXT NOT NULL,
                path TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                last_scanned TEXT
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
                session_id,
                role,
                content,
                tokenize='porter unicode61'
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_tool ON sessions(tool);
            CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
            CREATE INDEX IF NOT EXISTS idx_sessions_repo_path ON sessions(repo_path);
            CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_external_id ON sessions(external_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_source_mtime ON sessions(source_mtime);
            "
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn upsert_session(&self, session: &Session) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // Find existing session by deterministic id OR by agent_slug+external_id
        let existing_id: Option<String> = if let Some(ref ext_id) = session.external_id {
            conn.query_row(
                "SELECT id FROM sessions WHERE id = ?1 OR (agent_slug = ?2 AND external_id = ?3) LIMIT 1",
                params![session.id, session.agent_slug, ext_id],
                |row| row.get(0),
            ).ok()
        } else {
            conn.query_row(
                "SELECT id FROM sessions WHERE id = ?1 LIMIT 1",
                params![session.id],
                |row| row.get(0),
            ).ok()
        };

        let effective_id = existing_id.as_deref().unwrap_or(&session.id);

        // Delete old messages and search index entries for this session
        conn.execute("DELETE FROM search_index WHERE session_id = ?1", params![effective_id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM messages WHERE session_id = ?1", params![effective_id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM file_changes WHERE session_id = ?1", params![effective_id])
            .map_err(|e| e.to_string())?;
        // If the old id differs from the new deterministic id, remove the old row
        if existing_id.as_deref() != Some(&session.id) {
            if let Some(ref old_id) = existing_id {
                conn.execute("DELETE FROM sessions WHERE id = ?1", params![old_id])
                    .map_err(|e| e.to_string())?;
            }
        }

        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, tool, agent_slug, source_path, repo_name, repo_path, branch, title, started_at, ended_at, model, message_count, file_count, workspace, external_id, metadata, indexed_at, source_mtime)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                session.id,
                session.tool,
                session.agent_slug,
                session.source_path,
                session.repo_name,
                session.repo_path,
                session.branch,
                session.title,
                session.started_at,
                session.ended_at,
                session.model,
                session.message_count,
                session.file_count,
                session.workspace,
                session.external_id,
                session.metadata,
                session.indexed_at,
                session.source_mtime,
            ],
        ).map_err(|e| e.to_string())?;

        // Insert messages and search index
        for msg in &session.messages {
            conn.execute(
                "INSERT OR REPLACE INTO messages (id, session_id, idx, role, author, content, created_at, extra)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![msg.id, msg.session_id, msg.idx, msg.role, msg.author, msg.content, msg.created_at, msg.extra],
            ).map_err(|e| e.to_string())?;

            conn.execute(
                "INSERT INTO search_index (session_id, role, content) VALUES (?1, ?2, ?3)",
                params![msg.session_id, msg.role, msg.content],
            ).map_err(|e| e.to_string())?;
        }

        for fc in &session.file_changes {
            conn.execute(
                "INSERT OR REPLACE INTO file_changes (id, session_id, path, additions, deletions, diff_text)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![fc.id, fc.session_id, fc.path, fc.additions, fc.deletions, fc.diff_text],
            ).map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn get_session_summaries(&self, tool_filter: Option<&str>, repo_filter: Option<&str>, date_from: Option<&str>, date_to: Option<&str>, limit: usize, offset: usize) -> Result<Vec<SessionSummary>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut sql = String::from(
            "SELECT s.id, s.tool, s.agent_slug, s.title, s.repo_name, s.repo_path, s.started_at, s.ended_at, s.message_count, s.file_count, s.model, s.workspace,
                    CASE WHEN f.session_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
             FROM sessions s
             LEFT JOIN favorites f ON s.id = f.session_id
             WHERE 1=1"
        );
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(tool) = tool_filter {
            sql.push_str(&format!(" AND s.tool = ?{}", param_values.len() + 1));
            param_values.push(Box::new(tool.to_string()));
        }
        if let Some(repo) = repo_filter {
            sql.push_str(&format!(" AND s.repo_path = ?{}", param_values.len() + 1));
            param_values.push(Box::new(repo.to_string()));
        }
        if let Some(from) = date_from {
            sql.push_str(&format!(" AND s.started_at >= ?{}", param_values.len() + 1));
            param_values.push(Box::new(from.to_string()));
        }
        if let Some(to) = date_to {
            sql.push_str(&format!(" AND s.started_at <= ?{}", param_values.len() + 1));
            param_values.push(Box::new(to.to_string()));
        }

        sql.push_str(&format!(" ORDER BY s.started_at DESC LIMIT ?{} OFFSET ?{}", param_values.len() + 1, param_values.len() + 2));
        param_values.push(Box::new(limit as i64));
        param_values.push(Box::new(offset as i64));

        let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params_ref.as_slice(), |row| {
            Ok(SessionSummary {
                id: row.get(0)?,
                tool: row.get(1)?,
                agent_slug: row.get(2)?,
                title: row.get(3)?,
                repo_name: row.get(4)?,
                repo_path: row.get(5)?,
                started_at: row.get(6)?,
                ended_at: row.get(7)?,
                message_count: row.get(8)?,
                file_count: row.get(9)?,
                model: row.get(10)?,
                workspace: row.get(11)?,
                is_favorite: row.get(12)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
        Ok(results)
    }

    pub fn get_session(&self, id: &str) -> Result<Option<Session>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, tool, agent_slug, source_path, repo_name, repo_path, branch, title, started_at, ended_at, model, message_count, file_count, workspace, external_id, metadata, indexed_at, source_mtime FROM sessions WHERE id = ?1"
        ).map_err(|e| e.to_string())?;

        let session = stmt.query_row(params![id], |row| {
            Ok(Session {
                id: row.get(0)?,
                tool: row.get(1)?,
                agent_slug: row.get(2)?,
                source_path: row.get(3)?,
                repo_name: row.get(4)?,
                repo_path: row.get(5)?,
                branch: row.get(6)?,
                title: row.get(7)?,
                started_at: row.get(8)?,
                ended_at: row.get(9)?,
                model: row.get(10)?,
                message_count: row.get(11)?,
                file_count: row.get(12)?,
                workspace: row.get(13)?,
                external_id: row.get(14)?,
                metadata: row.get(15)?,
                indexed_at: row.get(16)?,
                source_mtime: row.get(17)?,
                messages: Vec::new(),
                file_changes: Vec::new(),
            })
        }).ok();

        if let Some(mut session) = session {
            // Load messages
            let mut msg_stmt = conn.prepare(
                "SELECT id, session_id, idx, role, author, content, created_at, extra FROM messages WHERE session_id = ?1 ORDER BY idx"
            ).map_err(|e| e.to_string())?;
            let msg_rows = msg_stmt.query_map(params![id], |row| {
                Ok(Message {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    idx: row.get(2)?,
                    role: row.get(3)?,
                    author: row.get(4)?,
                    content: row.get(5)?,
                    created_at: row.get(6)?,
                    extra: row.get(7)?,
                })
            }).map_err(|e| e.to_string())?;
            for row in msg_rows {
                session.messages.push(row.map_err(|e| e.to_string())?);
            }

            // Load file changes
            let mut fc_stmt = conn.prepare(
                "SELECT id, session_id, path, additions, deletions, diff_text FROM file_changes WHERE session_id = ?1"
            ).map_err(|e| e.to_string())?;
            let fc_rows = fc_stmt.query_map(params![id], |row| {
                Ok(FileChange {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    path: row.get(2)?,
                    additions: row.get(3)?,
                    deletions: row.get(4)?,
                    diff_text: row.get(5)?,
                })
            }).map_err(|e| e.to_string())?;
            for row in fc_rows {
                session.file_changes.push(row.map_err(|e| e.to_string())?);
            }

            Ok(Some(session))
        } else {
            Ok(None)
        }
    }

    pub fn search(&self, query: &str, tool_filter: Option<&str>, repo_filter: Option<&str>, date_from: Option<&str>, date_to: Option<&str>, limit: usize) -> Result<Vec<SearchResult>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut sql = String::from(
            "SELECT DISTINCT s.id, s.tool, s.agent_slug, s.title, s.repo_name, s.repo_path, s.started_at, s.message_count, s.model, s.workspace,
                    snippet(search_index, 2, '<mark>', '</mark>', '…', 40) as snippet
             FROM search_index si
             JOIN sessions s ON si.session_id = s.id
             WHERE search_index MATCH ?1"
        );
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        param_values.push(Box::new(query.to_string()));

        if let Some(tool) = tool_filter {
            sql.push_str(&format!(" AND s.tool = ?{}", param_values.len() + 1));
            param_values.push(Box::new(tool.to_string()));
        }
        if let Some(repo) = repo_filter {
            sql.push_str(&format!(" AND s.repo_path = ?{}", param_values.len() + 1));
            param_values.push(Box::new(repo.to_string()));
        }
        if let Some(from) = date_from {
            sql.push_str(&format!(" AND s.started_at >= ?{}", param_values.len() + 1));
            param_values.push(Box::new(from.to_string()));
        }
        if let Some(to) = date_to {
            sql.push_str(&format!(" AND s.started_at <= ?{}", param_values.len() + 1));
            param_values.push(Box::new(to.to_string()));
        }

        sql.push_str(&format!(" ORDER BY rank LIMIT ?{}", param_values.len() + 1));
        param_values.push(Box::new(limit as i64));

        let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params_ref.as_slice(), |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                tool: row.get(1)?,
                agent_slug: row.get(2)?,
                title: row.get(3)?,
                repo_name: row.get(4)?,
                repo_path: row.get(5)?,
                started_at: row.get(6)?,
                message_count: row.get(7)?,
                model: row.get(8)?,
                workspace: row.get(9)?,
                snippet: row.get(10)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
        Ok(results)
    }

    pub fn toggle_favorite(&self, session_id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) FROM favorites WHERE session_id = ?1",
            params![session_id],
            |row| row.get::<_, i64>(0).map(|c| c > 0),
        ).map_err(|e| e.to_string())?;

        if exists {
            conn.execute("DELETE FROM favorites WHERE session_id = ?1", params![session_id])
                .map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO favorites (session_id, created_at) VALUES (?1, ?2)",
                params![session_id, now],
            ).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }

    pub fn get_favorites(&self, limit: usize, offset: usize) -> Result<Vec<SessionSummary>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.tool, s.agent_slug, s.title, s.repo_name, s.repo_path, s.started_at, s.ended_at, s.message_count, s.file_count, s.model, s.workspace, 1 as is_favorite
             FROM sessions s
             JOIN favorites f ON s.id = f.session_id
             ORDER BY f.created_at DESC
             LIMIT ?1 OFFSET ?2"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map(params![limit as i64, offset as i64], |row| {
            Ok(SessionSummary {
                id: row.get(0)?,
                tool: row.get(1)?,
                agent_slug: row.get(2)?,
                title: row.get(3)?,
                repo_name: row.get(4)?,
                repo_path: row.get(5)?,
                started_at: row.get(6)?,
                ended_at: row.get(7)?,
                message_count: row.get(8)?,
                file_count: row.get(9)?,
                model: row.get(10)?,
                workspace: row.get(11)?,
                is_favorite: row.get(12)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
        Ok(results)
    }

    pub fn get_tools(&self) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT DISTINCT tool FROM sessions ORDER BY tool")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        let mut tools = Vec::new();
        for row in rows {
            tools.push(row.map_err(|e| e.to_string())?);
        }
        Ok(tools)
    }

    pub fn get_repos(&self) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT DISTINCT repo_path FROM sessions WHERE repo_path IS NOT NULL ORDER BY repo_path")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        let mut repos = Vec::new();
        for row in rows {
            repos.push(row.map_err(|e| e.to_string())?);
        }
        Ok(repos)
    }

    pub fn get_stats(&self) -> Result<serde_json::Value, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let total_sessions: i64 = conn.query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let total_messages: i64 = conn.query_row("SELECT COUNT(*) FROM messages", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let total_tools: i64 = conn.query_row("SELECT COUNT(DISTINCT tool) FROM sessions", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;

        Ok(serde_json::json!({
            "total_sessions": total_sessions,
            "total_messages": total_messages,
            "total_tools": total_tools,
        }))
    }

    pub fn get_session_mtime(&self, external_id: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let result = conn.query_row(
            "SELECT source_mtime FROM sessions WHERE external_id = ?1",
            params![external_id],
            |row| row.get(0),
        ).ok();
        Ok(result)
    }

    pub fn delete_session(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM search_index WHERE session_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM file_changes WHERE session_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM messages WHERE session_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM favorites WHERE session_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn clear_all(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            "DELETE FROM search_index;
             DELETE FROM file_changes;
             DELETE FROM messages;
             DELETE FROM favorites;
             DELETE FROM sessions;
             DELETE FROM scan_sources;"
        ).map_err(|e| e.to_string())?;
        Ok(())
    }
}
