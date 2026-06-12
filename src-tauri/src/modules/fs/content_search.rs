//! Project-wide content search and replace.
//!
//! Transportable to the frontend via ts-rs bindings (see `gen/bindings/`).
//! Walks with `ignore::WalkBuilder` (respects .gitignore) and uses the
//! grep-* crates for matching and binary detection.

use std::path::Path;

use globset::{Glob, GlobSet, GlobSetBuilder};
use grep_matcher::Matcher;
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::{sinks::UTF8, BinaryDetection, SearcherBuilder};
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use ts_rs::TS;

use super::file::{write_atomic, FileWrittenEvent};
use super::{search::PRUNE_DIRS, to_canon};
use crate::modules::workspace::{resolve_path, WorkspaceEnv};

/// Default and hard caps on returned matches.
const DEFAULT_MAX_RESULTS: usize = 2_000;
const HARD_MAX_RESULTS: usize = 10_000;
/// Hard cap on files visited, mirroring `search.rs::MAX_SCANNED`.
const MAX_SCANNED: usize = 50_000;
/// Cap on returned line text, in characters.
const MAX_LINE_CHARS: usize = 500;
/// Skip files larger than this; content search on huge blobs is rarely useful.
const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024; // 10 MB

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[ts(export, export_to = "../gen/bindings/")]
#[serde(default)]
pub struct ContentSearchOptions {
    pub case_sensitive: bool,
    pub whole_word: bool,
    /// Treat `query` as a regular expression instead of a literal string.
    pub regex: bool,
    /// Glob restricting which files are searched (e.g. `**/*.ts`).
    pub include_glob: Option<String>,
    /// Glob excluding files from the search.
    pub exclude_glob: Option<String>,
    /// Cap on total matches returned. Defaults to 2000, hard cap 10000.
    pub max_results: Option<usize>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../gen/bindings/")]
pub struct ContentMatch {
    /// Path relative to the search root, forward-slashed.
    pub path: String,
    /// Absolute path of the matched file.
    pub absolute_path: String,
    /// 1-based line number.
    #[ts(type = "number")]
    pub line_number: u64,
    /// The matched line (line endings stripped, capped at 500 chars).
    pub line_text: String,
    /// Byte offset of the match start within `line_text`.
    #[ts(type = "number")]
    pub match_start: usize,
    /// Byte offset of the match end within `line_text`.
    #[ts(type = "number")]
    pub match_end: usize,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../gen/bindings/")]
pub struct ContentSearchResult {
    pub matches: Vec<ContentMatch>,
    /// True if the scan stopped early (match cap or entry budget reached).
    pub truncated: bool,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "../gen/bindings/")]
pub struct ReplaceEdit {
    /// 1-based line number, as returned by `fs_content_search`.
    #[ts(type = "number")]
    pub line_number: u64,
    /// Byte offset of the match start within the (capped) line text.
    #[ts(type = "number")]
    pub match_start: usize,
    /// Byte offset of the match end within the (capped) line text.
    #[ts(type = "number")]
    pub match_end: usize,
    pub replacement: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../gen/bindings/")]
pub struct ReplaceAllResult {
    #[ts(type = "number")]
    pub files_changed: usize,
    #[ts(type = "number")]
    pub matches_replaced: usize,
}

fn build_matcher(query: &str, options: &ContentSearchOptions) -> Result<RegexMatcher, String> {
    RegexMatcherBuilder::new()
        .case_insensitive(!options.case_sensitive)
        .word(options.whole_word)
        .fixed_strings(!options.regex)
        .build(query)
        .map_err(|e| format!("invalid search pattern: {e}"))
}

fn build_globset(glob: Option<&str>) -> Result<Option<GlobSet>, String> {
    let Some(glob) = glob.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let mut builder = GlobSetBuilder::new();
    for part in glob.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        // Bare names like `*.ts` should match at any depth, like VS Code.
        let pattern = if part.contains('/') {
            part.to_string()
        } else {
            format!("**/{part}")
        };
        builder.add(Glob::new(&pattern).map_err(|e| format!("invalid glob `{part}`: {e}"))?);
    }
    Ok(Some(builder.build().map_err(|e| e.to_string())?))
}

/// Cap a line at `MAX_LINE_CHARS` characters (on a char boundary), clamping
/// match offsets into the kept prefix.
fn cap_line(line: &str, start: usize, end: usize) -> (String, usize, usize) {
    let trimmed = line.trim_end_matches(['\r', '\n']);
    if trimmed.chars().count() <= MAX_LINE_CHARS {
        let len = trimmed.len();
        return (trimmed.to_string(), start.min(len), end.min(len));
    }
    let cut = trimmed
        .char_indices()
        .nth(MAX_LINE_CHARS)
        .map(|(i, _)| i)
        .unwrap_or(trimmed.len());
    let capped = &trimmed[..cut];
    (capped.to_string(), start.min(cut), end.min(cut))
}

/// Search one file, pushing matches into `out`. Returns true if the per-search
/// match cap was hit.
fn search_file(
    matcher: &RegexMatcher,
    path: &Path,
    rel: &str,
    cap: usize,
    out: &mut Vec<ContentMatch>,
) -> bool {
    let mut searcher = SearcherBuilder::new()
        .binary_detection(BinaryDetection::quit(0))
        .line_number(true)
        .build();
    let absolute = to_canon(path);
    let mut capped = false;
    let result = searcher.search_path(
        matcher,
        path,
        UTF8(|line_number, line| {
            let mut at = 0;
            while let Ok(Some(m)) = matcher.find_at(line.as_bytes(), at) {
                if out.len() >= cap {
                    capped = true;
                    return Ok(false);
                }
                let (line_text, match_start, match_end) = cap_line(line, m.start(), m.end());
                out.push(ContentMatch {
                    path: rel.to_string(),
                    absolute_path: absolute.clone(),
                    line_number,
                    line_text,
                    match_start,
                    match_end,
                });
                // Guard against zero-width regex matches looping forever.
                at = if m.end() > m.start() { m.end() } else { m.end() + 1 };
                if at >= line.len() {
                    break;
                }
            }
            Ok(true)
        }),
    );
    if let Err(e) = result {
        log::debug!("content search skipped {}: {e}", path.display());
    }
    capped
}

/// Walk `root`, calling `visit(path, rel)` for each candidate file. Returns
/// true if the walk stopped early. `visit` returns true to stop the walk.
fn walk_files(
    root_path: &Path,
    include: Option<&GlobSet>,
    exclude: Option<&GlobSet>,
    mut visit: impl FnMut(&Path, &str) -> bool,
) -> bool {
    let walker = WalkBuilder::new(root_path)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .filter_entry(|dent| {
            if dent.depth() == 0 {
                return true;
            }
            match dent.file_name().to_str() {
                Some(name) => !PRUNE_DIRS.contains(&name),
                None => true,
            }
        })
        .build();

    let mut scanned: usize = 0;
    for dent in walker.flatten() {
        scanned += 1;
        if scanned > MAX_SCANNED {
            return true;
        }
        if !dent.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        if dent
            .metadata()
            .map(|m| m.len() > MAX_FILE_BYTES)
            .unwrap_or(false)
        {
            continue;
        }
        let path = dent.path();
        let rel = match path.strip_prefix(root_path) {
            Ok(r) => to_canon(r),
            Err(_) => continue,
        };
        if let Some(inc) = include {
            if !inc.is_match(&rel) {
                continue;
            }
        }
        if let Some(exc) = exclude {
            if exc.is_match(&rel) {
                continue;
            }
        }
        if visit(path, &rel) {
            return true;
        }
    }
    false
}

fn content_search_blocking(
    root: String,
    query: String,
    options: ContentSearchOptions,
    workspace: WorkspaceEnv,
) -> Result<ContentSearchResult, String> {
    if query.is_empty() {
        return Ok(ContentSearchResult {
            matches: Vec::new(),
            truncated: false,
        });
    }
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let matcher = build_matcher(&query, &options)?;
    let include = build_globset(options.include_glob.as_deref())?;
    let exclude = build_globset(options.exclude_glob.as_deref())?;
    let cap = options
        .max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, HARD_MAX_RESULTS);

    let mut matches: Vec<ContentMatch> = Vec::new();
    let mut truncated = walk_files(
        &root_path,
        include.as_ref(),
        exclude.as_ref(),
        |path, rel| search_file(&matcher, path, rel, cap, &mut matches),
    );
    if matches.len() >= cap {
        truncated = true;
    }
    Ok(ContentSearchResult { matches, truncated })
}

#[tauri::command]
pub async fn fs_content_search(
    root: String,
    query: String,
    options: Option<ContentSearchOptions>,
    workspace: Option<WorkspaceEnv>,
) -> Result<ContentSearchResult, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let options = options.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        content_search_blocking(root, query, options, workspace)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Apply `edits` to the line `line` (line-ending-free). Edits must all target
/// this line; they are applied right-to-left so earlier offsets stay valid.
fn apply_line_edits(line: &str, edits: &mut [&ReplaceEdit]) -> Result<String, String> {
    edits.sort_by_key(|e| std::cmp::Reverse(e.match_start));
    let mut out = line.to_string();
    let mut last_start = usize::MAX;
    for edit in edits.iter() {
        if edit.match_start > edit.match_end
            || edit.match_end > out.len()
            || edit.match_end > last_start
            || !out.is_char_boundary(edit.match_start)
            || !out.is_char_boundary(edit.match_end)
        {
            return Err(format!(
                "invalid replacement range {}..{} on line of length {}",
                edit.match_start,
                edit.match_end,
                out.len()
            ));
        }
        out.replace_range(edit.match_start..edit.match_end, &edit.replacement);
        last_start = edit.match_start;
    }
    Ok(out)
}

fn apply_replacements(content: &str, replacements: &[ReplaceEdit]) -> Result<String, String> {
    let mut out = String::with_capacity(content.len());
    let mut rest = content;
    let mut line_number: u64 = 0;
    while !rest.is_empty() {
        line_number += 1;
        let (line_end, ending_len) = match rest.find('\n') {
            Some(i) => {
                if i > 0 && rest.as_bytes()[i - 1] == b'\r' {
                    (i - 1, 2)
                } else {
                    (i, 1)
                }
            }
            None => (rest.len(), 0),
        };
        let line = &rest[..line_end];
        let ending = &rest[line_end..line_end + ending_len];
        let mut edits: Vec<&ReplaceEdit> = replacements
            .iter()
            .filter(|r| r.line_number == line_number)
            .collect();
        if edits.is_empty() {
            out.push_str(line);
        } else {
            out.push_str(&apply_line_edits(line, &mut edits).map_err(|e| {
                format!("line {line_number}: {e}")
            })?);
        }
        out.push_str(ending);
        rest = &rest[line_end + ending_len..];
    }
    let max_line = replacements.iter().map(|r| r.line_number).max().unwrap_or(0);
    if max_line > line_number {
        return Err(format!(
            "replacement targets line {max_line} but file has only {line_number} lines"
        ));
    }
    Ok(out)
}

#[tauri::command]
pub fn fs_replace_in_file(
    path: String,
    replacements: Vec<ReplaceEdit>,
    workspace: Option<WorkspaceEnv>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if replacements.is_empty() {
        return Ok(());
    }
    let workspace = WorkspaceEnv::from_option(workspace);
    let target = resolve_path(&path, &workspace);
    let content = std::fs::read_to_string(&target).map_err(|e| {
        log::debug!("fs_replace_in_file read({}) failed: {e}", target.display());
        e.to_string()
    })?;
    let updated = apply_replacements(&content, &replacements)?;
    write_atomic(&target, updated.as_bytes()).map_err(|e| {
        log::warn!("fs_replace_in_file({}) failed: {e}", target.display());
        e.to_string()
    })?;
    let _ = app.emit(
        "fs:file-written",
        FileWrittenEvent {
            path,
            source: Some("search-replace".to_string()),
        },
    );
    Ok(())
}

/// Replace every match of `query` in `content` with `replacement` (literal).
/// Returns `None` when nothing matched.
fn replace_in_content(
    matcher: &RegexMatcher,
    content: &str,
    replacement: &str,
) -> Option<(String, usize)> {
    let bytes = content.as_bytes();
    let mut out = String::with_capacity(content.len());
    let mut at = 0;
    let mut count = 0;
    while at <= bytes.len() {
        match matcher.find_at(bytes, at) {
            Ok(Some(m)) => {
                out.push_str(&content[at..m.start()]);
                out.push_str(replacement);
                count += 1;
                if m.end() > m.start() {
                    at = m.end();
                } else {
                    // Zero-width match: copy one char forward to make progress.
                    let step = content[m.end()..].chars().next().map_or(1, char::len_utf8);
                    let next = (m.end() + step).min(content.len());
                    out.push_str(&content[m.end()..next]);
                    at = next;
                    if m.end() >= content.len() {
                        break;
                    }
                }
            }
            _ => break,
        }
    }
    if count == 0 {
        return None;
    }
    out.push_str(&content[at..]);
    Some((out, count))
}

fn replace_all_blocking(
    root: String,
    query: String,
    options: ContentSearchOptions,
    replacement: String,
    workspace: WorkspaceEnv,
    app: tauri::AppHandle,
) -> Result<ReplaceAllResult, String> {
    if query.is_empty() {
        return Ok(ReplaceAllResult {
            files_changed: 0,
            matches_replaced: 0,
        });
    }
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let matcher = build_matcher(&query, &options)?;
    let include = build_globset(options.include_glob.as_deref())?;
    let exclude = build_globset(options.exclude_glob.as_deref())?;

    let mut files_changed = 0usize;
    let mut matches_replaced = 0usize;
    let mut first_error: Option<String> = None;
    walk_files(&root_path, include.as_ref(), exclude.as_ref(), |path, _| {
        // We must read the whole file to replace anyway, so read once and
        // skip non-UTF-8 / binary files (read_to_string fails on invalid
        // UTF-8; the null-byte sniff catches UTF-8-clean binaries).
        let Ok(content) = std::fs::read_to_string(path) else {
            return false;
        };
        if content.as_bytes().contains(&0) {
            return false;
        }
        let Some((updated, count)) = replace_in_content(&matcher, &content, &replacement) else {
            return false;
        };
        match write_atomic(path, updated.as_bytes()) {
            Ok(()) => {
                files_changed += 1;
                matches_replaced += count;
                let _ = app.emit(
                    "fs:file-written",
                    FileWrittenEvent {
                        path: to_canon(path),
                        source: Some("search-replace".to_string()),
                    },
                );
            }
            Err(e) => {
                log::warn!("fs_replace_all write({}) failed: {e}", path.display());
                if first_error.is_none() {
                    first_error = Some(format!("{}: {e}", path.display()));
                }
            }
        }
        false
    });
    if let Some(e) = first_error {
        return Err(format!(
            "replaced {matches_replaced} matches in {files_changed} files, but some writes failed: {e}"
        ));
    }
    Ok(ReplaceAllResult {
        files_changed,
        matches_replaced,
    })
}

#[tauri::command]
pub async fn fs_replace_all(
    root: String,
    query: String,
    options: Option<ContentSearchOptions>,
    replacement: String,
    workspace: Option<WorkspaceEnv>,
    app: tauri::AppHandle,
) -> Result<ReplaceAllResult, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    let options = options.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        replace_all_blocking(root, query, options, replacement, workspace, app)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> ContentSearchOptions {
        ContentSearchOptions {
            case_sensitive: true,
            ..Default::default()
        }
    }

    #[test]
    fn literal_matcher_escapes_metachars() {
        let m = build_matcher("a.b(", &opts()).unwrap();
        assert!(m.find_at(b"xx a.b( yy", 0).unwrap().is_some());
        assert!(m.find_at(b"aXb(", 0).unwrap().is_none());
    }

    #[test]
    fn apply_replacements_edits_correct_lines() {
        let content = "foo bar\nbaz foo\nfoo\n";
        let edits = vec![
            ReplaceEdit {
                line_number: 1,
                match_start: 0,
                match_end: 3,
                replacement: "qux".into(),
            },
            ReplaceEdit {
                line_number: 3,
                match_start: 0,
                match_end: 3,
                replacement: "qux".into(),
            },
        ];
        assert_eq!(
            apply_replacements(content, &edits).unwrap(),
            "qux bar\nbaz foo\nqux\n"
        );
    }

    #[test]
    fn apply_replacements_multiple_on_one_line() {
        let content = "aa bb aa\n";
        let edits = vec![
            ReplaceEdit {
                line_number: 1,
                match_start: 0,
                match_end: 2,
                replacement: "X".into(),
            },
            ReplaceEdit {
                line_number: 1,
                match_start: 6,
                match_end: 8,
                replacement: "Y".into(),
            },
        ];
        assert_eq!(apply_replacements(content, &edits).unwrap(), "X bb Y\n");
    }

    #[test]
    fn apply_replacements_preserves_crlf() {
        let content = "one\r\ntwo\r\n";
        let edits = vec![ReplaceEdit {
            line_number: 2,
            match_start: 0,
            match_end: 3,
            replacement: "2".into(),
        }];
        assert_eq!(apply_replacements(content, &edits).unwrap(), "one\r\n2\r\n");
    }

    #[test]
    fn apply_replacements_rejects_out_of_range() {
        let content = "short\n";
        let edits = vec![ReplaceEdit {
            line_number: 1,
            match_start: 0,
            match_end: 99,
            replacement: "x".into(),
        }];
        assert!(apply_replacements(content, &edits).is_err());
    }

    #[test]
    fn apply_replacements_rejects_missing_line() {
        let content = "one\n";
        let edits = vec![ReplaceEdit {
            line_number: 5,
            match_start: 0,
            match_end: 1,
            replacement: "x".into(),
        }];
        assert!(apply_replacements(content, &edits).is_err());
    }

    #[test]
    fn replace_in_content_counts_matches() {
        let m = build_matcher("foo", &opts()).unwrap();
        let (out, n) = replace_in_content(&m, "foo bar foo", "qux").unwrap();
        assert_eq!(out, "qux bar qux");
        assert_eq!(n, 2);
    }

    #[test]
    fn replace_in_content_none_when_no_match() {
        let m = build_matcher("zzz", &opts()).unwrap();
        assert!(replace_in_content(&m, "foo bar", "qux").is_none());
    }

    #[test]
    fn cap_line_clamps_offsets() {
        let long = "x".repeat(600);
        let (text, s, e) = cap_line(&long, 550, 560);
        assert_eq!(text.len(), 500);
        assert_eq!(s, 500);
        assert_eq!(e, 500);
    }

    #[test]
    fn end_to_end_search_and_replace_all() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "hello world\nhello again\n").unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("sub/b.txt"), "no match here\n").unwrap();
        std::fs::write(dir.path().join("sub/c.md"), "hello md\n").unwrap();

        let matcher = build_matcher("hello", &opts()).unwrap();
        let include = build_globset(Some("*.txt")).unwrap();
        let mut matches = Vec::new();
        walk_files(dir.path(), include.as_ref(), None, |path, rel| {
            search_file(&matcher, path, rel, 100, &mut matches)
        });
        assert_eq!(matches.len(), 2);
        assert!(matches.iter().all(|m| m.path == "a.txt"));
        assert_eq!(matches[0].line_number, 1);
        assert_eq!(matches[0].match_start, 0);
        assert_eq!(matches[0].match_end, 5);
    }
}
