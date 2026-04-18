import { useState, useEffect, useCallback, useRef } from 'react';
import type { SessionSummary, Session, SearchResult, DetectedSource, View, DateFilter, Stats } from './types';
import * as api from './api';
import MessageBody from './MessageBody';
import './styles.css';

function formatTime(ts: string | null): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function formatFullDate(ts: string | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '—';
  }
}

function dateGroupLabel(ts: string | null): string {
  if (!ts) return 'Unknown';
  try {
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.floor((today.getTime() - sessionDay.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return 'This Week';
    if (diff < 30) return 'This Month';
    return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
  } catch {
    return 'Unknown';
  }
}

function getDateRange(filter: DateFilter): { from?: string; to?: string } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (filter) {
    case 'today':
      return { from: startOfDay.toISOString() };
    case 'yesterday': {
      const yesterday = new Date(startOfDay);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: yesterday.toISOString(), to: startOfDay.toISOString() };
    }
    case '7days': {
      const week = new Date(startOfDay);
      week.setDate(week.getDate() - 7);
      return { from: week.toISOString() };
    }
    case '30days': {
      const month = new Date(startOfDay);
      month.setDate(month.getDate() - 30);
      return { from: month.toISOString() };
    }
    default:
      return {};
  }
}

function repoShortName(path: string | null): string {
  if (!path) return '';
  const parts = path.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || path;
}

function toolSlug(name: string): string {
  return name.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function toolCssClass(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('copilot')) return 'copilot';
  if (n.includes('claude')) return 'claude_code';
  if (n.includes('cursor')) return 'cursor';
  if (n.includes('aider')) return 'aider';
  if (n.includes('codex')) return 'codex';
  if (n.includes('cline')) return 'cline';
  if (n.includes('gemini')) return 'gemini';
  return toolSlug(name);
}

export default function App() {
  const [view, setView] = useState<View>('timeline');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [, setRepos] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sources, setSources] = useState<DetectedSource[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [toolFilter, setToolFilter] = useState<string | undefined>();
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prevView, setPrevView] = useState<View>('timeline');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const range = getDateRange(dateFilter);
      const data = await api.getSessions({
        tool: toolFilter,
        dateFrom: range.from,
        dateTo: range.to,
        limit: 200,
      });
      setSessions(data);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
    setLoading(false);
  }, [dateFilter, toolFilter]);

  const loadMeta = useCallback(async () => {
    try {
      const [t, r, s] = await Promise.all([api.getTools(), api.getRepos(), api.getStats()]);
      setTools(t);
      setRepos(r);
      setStats(s);
    } catch (e) {
      console.error('Failed to load metadata:', e);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    loadMeta();
  }, [loadSessions, loadMeta]);

  // Periodic background incremental scan every 30s
  useEffect(() => {
    const lastScanRef = { ts: new Date().toISOString() };

    const runIncrementalScan = async () => {
      try {
        const count = await api.scanIncremental(lastScanRef.ts);
        lastScanRef.ts = new Date().toISOString();
        if (count > 0) {
          // New data found — refresh UI
          await loadSessions();
          await loadMeta();
        }
      } catch (e) {
        console.error('[recall] Incremental scan failed:', e);
      }
    };

    const interval = setInterval(runIncrementalScan, 30_000);
    return () => clearInterval(interval);
  }, [loadSessions, loadMeta]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await api.scanAll();
      await loadSessions();
      await loadMeta();
    } catch (e) {
      console.error('Scan failed:', e);
    }
    setScanning(false);
  };

  const openSession = async (id: string) => {
    try {
      const session = await api.getSession(id);
      setSelectedSession(session);
      setPrevView(view === 'session' ? prevView : view);
      setView('session');
    } catch (e) {
      console.error('Failed to open session:', e);
    }
  };

  // Auto-refresh the currently viewed session every 10s (catches active session updates)
  useEffect(() => {
    if (view !== 'session' || !selectedSession) return;

    const refreshSession = async () => {
      try {
        const updated = await api.getSession(selectedSession.id);
        if (updated && updated.messages.length !== selectedSession.messages.length) {
          setSelectedSession(updated);
        }
      } catch {
        // Ignore — session may have been deleted
      }
    };

    const interval = setInterval(refreshSession, 10_000);
    return () => clearInterval(interval);
  }, [view, selectedSession]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      if (view === 'search') setView('timeline');
      return;
    }
    setView('search');
    try {
      const results = await api.searchSessions({ query: query.trim(), tool: toolFilter });
      setSearchResults(results);
    } catch (e) {
      console.error('Search failed:', e);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await api.toggleFavorite(sessionId);
      await loadSessions();
    } catch (e) {
      console.error('Toggle favorite failed:', e);
    }
  };

  const handleExport = async (format: string) => {
    if (!selectedSession) return;
    try {
      const data = await api.exportSession(selectedSession.id, format);
      const blob = new Blob([data.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const loadFavorites = async () => {
    try {
      const favs = await api.getFavorites();
      setSessions(favs);
    } catch (e) {
      console.error('Failed to load favorites:', e);
    }
  };

  const loadSources = async () => {
    try {
      const s = await api.detectSources();
      setSources(s);
    } catch (e) {
      console.error('Failed to detect sources:', e);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (view === 'session') {
          setView(prevView);
          setSelectedSession(null);
        } else if (view === 'search') {
          setSearchQuery('');
          setSearchResults([]);
          setView('timeline');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view, prevView]);

  const groupedSessions = sessions.reduce<{ label: string; items: SessionSummary[] }[]>((acc, s) => {
    const label = dateGroupLabel(s.started_at);
    const existing = acc.find((g) => g.label === label);
    if (existing) {
      existing.items.push(s);
    } else {
      acc.push({ label, items: [s] });
    }
    return acc;
  }, []);

  const renderCard = (s: SessionSummary, showFav = true) => (
    <div key={s.id} className="session-card" onClick={() => openSession(s.id)}>
      <div className="session-card-body">
        <div className="session-card-title">{s.title || 'Untitled Session'}</div>
        <div className="session-card-sub">
          <span className={`tool-pill ${toolCssClass(s.tool)}`}>{s.tool}</span>
          {s.model && <span>{s.model}</span>}
          {s.repo_path && <span className="repo-tag">{repoShortName(s.repo_path)}</span>}
        </div>
      </div>
      <div className="session-card-right">
        <span className="session-card-time">{formatTime(s.started_at)}</span>
        <span className="session-card-counts">
          {s.message_count} msg{s.message_count !== 1 ? 's' : ''}
          {s.file_count > 0 ? ` · ${s.file_count} file${s.file_count !== 1 ? 's' : ''}` : ''}
        </span>
        {showFav && (
          <button className={`fav-btn ${s.is_favorite ? 'on' : ''}`} onClick={(e) => handleToggleFavorite(e, s.id)}>
            {s.is_favorite ? '★' : '☆'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-mark">R</div>
            Recall
          </div>
          {stats && (
            <div className="sidebar-stats">
              {stats.total_sessions} sessions · {stats.total_tools} tools
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group-label">Browse</div>
          <div
            className={`nav-item ${view === 'timeline' && !toolFilter ? 'active' : ''}`}
            onClick={() => { setToolFilter(undefined); setView('timeline'); loadSessions(); }}
          >
            <span className="nav-icon">⏱</span>
            Timeline
            {stats && <span className="nav-count">{stats.total_sessions}</span>}
          </div>
          <div
            className={`nav-item ${view === 'favorites' ? 'active' : ''}`}
            onClick={() => { setView('favorites'); loadFavorites(); }}
          >
            <span className="nav-icon">★</span>
            Favorites
          </div>

          {tools.length > 0 && (
            <>
              <div className="nav-group-label">Tools</div>
              {tools.map((t) => (
                <div
                  key={t}
                  className={`nav-item ${toolFilter === t && view === 'timeline' ? 'active' : ''}`}
                  onClick={() => {
                    setToolFilter(toolFilter === t ? undefined : t);
                    setView('timeline');
                  }}
                >
                  <div className={`tool-dot ${toolCssClass(t)}`} />
                  {t}
                </div>
              ))}
            </>
          )}

          <div className="nav-group-label">System</div>
          <div
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => { setView('settings'); loadSources(); }}
          >
            <span className="nav-icon">⚙</span>
            Settings
          </div>
        </nav>

        <div className="sidebar-bottom">
          <button className="scan-btn" onClick={handleScan} disabled={scanning}>
            {scanning ? (
              <><span className="spin-icon">↻</span> Scanning…</>
            ) : (
              <>↻ Scan Sources</>
            )}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          {view !== 'session' && (
            <>
              <div className="search-box">
                <span className="search-icon-el">⌕</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search sessions, prompts, code…"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
                <span className="kbd-hint">⌘K</span>
              </div>
              <div className="chip-bar">
                {(['all', 'today', 'yesterday', '7days', '30days'] as DateFilter[]).map((f) => (
                  <button
                    key={f}
                    className={`chip ${dateFilter === f ? 'on' : ''}`}
                    onClick={() => setDateFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === '7days' ? '7d' : f === '30days' ? '30d' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </>
          )}
          {view === 'session' && selectedSession && (
            <div className="topbar-session-info">
              <button className="topbar-back-btn" onClick={() => { setView(prevView); setSelectedSession(null); }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3L5 8l5 5" /></svg>
              </button>
              <span className="topbar-session-title">{selectedSession.title || 'Untitled Session'}</span>
              <span className={`tool-pill ${toolCssClass(selectedSession.tool)}`}>{selectedSession.tool}</span>
            </div>
          )}
        </div>

        <div className="content">
          {view === 'timeline' && (
            <div className="enter">
              {loading ? (
                <div className="empty"><span className="spinner" /></div>
              ) : sessions.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">⌕</div>
                  <h3>No sessions found</h3>
                  <p>Scan your system to discover AI coding session history from Copilot, Claude Code, Cursor, Aider, and more.</p>
                  <button className="primary-btn" onClick={handleScan}>
                    {scanning ? 'Scanning…' : 'Scan for Sessions'}
                  </button>
                </div>
              ) : (
                <div className="session-feed">
                  {groupedSessions.map((group) => (
                    <div key={group.label}>
                      <div className="group-label">{group.label}</div>
                      {group.items.map((s) => renderCard(s))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'favorites' && (
            <div className="enter">
              {sessions.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">★</div>
                  <h3>No favorites yet</h3>
                  <p>Star sessions you want to find quickly later.</p>
                </div>
              ) : (
                <div className="session-feed">
                  {sessions.map((s) => renderCard(s, false))}
                </div>
              )}
            </div>
          )}

          {view === 'search' && (
            <div className="enter">
              {searchResults.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">⌕</div>
                  <h3>No results</h3>
                  <p>Try a different search term.</p>
                </div>
              ) : (
                <div className="search-results">
                  {searchResults.map((r) => (
                    <div key={r.id} className="search-hit" onClick={() => openSession(r.id)}>
                      <div className="search-hit-title">{r.title || 'Untitled'}</div>
                      <div className="search-hit-snippet" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                      <div className="search-hit-meta">
                        <span className={`tool-pill ${toolCssClass(r.tool)}`}>{r.tool}</span>
                        <span>{formatTime(r.started_at)}</span>
                        {r.repo_name && <span>{r.repo_name}</span>}
                        <span>{r.message_count} msgs</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'session' && selectedSession && (
            <div className="detail enter">
              <div className="detail-chips">
                {selectedSession.started_at && (
                  <div className="detail-chip">
                    <span className="label">Started</span>
                    <span className="val">{formatFullDate(selectedSession.started_at)}</span>
                  </div>
                )}
                {selectedSession.ended_at && (
                  <div className="detail-chip">
                    <span className="label">Ended</span>
                    <span className="val">{formatFullDate(selectedSession.ended_at)}</span>
                  </div>
                )}
                {selectedSession.model && (
                  <div className="detail-chip">
                    <span className="label">Model</span>
                    <span className="val">{selectedSession.model}</span>
                  </div>
                )}
                {selectedSession.repo_path && (
                  <div className="detail-chip">
                    <span className="label">Repo</span>
                    <span className="val">{selectedSession.repo_path}</span>
                  </div>
                )}
                {selectedSession.branch && (
                  <div className="detail-chip">
                    <span className="label">Branch</span>
                    <span className="val">{selectedSession.branch}</span>
                  </div>
                )}
              </div>
              <div className="detail-toolbar">
                <button className="ghost-btn" onClick={() => handleExport('markdown')}>Export MD</button>
                <button className="ghost-btn" onClick={() => handleExport('json')}>Export JSON</button>
                <button className="ghost-btn" onClick={() => handleExport('text')}>Export Text</button>
                {selectedSession.repo_path && (
                  <button className="ghost-btn" onClick={() => navigator.clipboard.writeText(selectedSession.repo_path || '')}>
                    Copy Path
                  </button>
                )}
              </div>

              <div className="thread">
                {selectedSession.messages.map((msg) => (
                  <div key={msg.id} className={`msg ${msg.role}`}>
                    <div className="msg-role">
                      {msg.role === 'user' ? 'You' : msg.author || msg.role}
                      {msg.created_at && <span className="msg-ts">{formatFullDate(msg.created_at)}</span>}
                    </div>
                    <MessageBody content={msg.content} extra={msg.extra} />
                    <button className="msg-copy" onClick={() => navigator.clipboard.writeText(msg.content)}>copy</button>
                  </div>
                ))}
              </div>

              {selectedSession.file_changes.length > 0 && (
                <div className="diff-section">
                  <div className="diff-section-title">Files Changed ({selectedSession.file_changes.length})</div>
                  {selectedSession.file_changes.map((fc) => (
                    <div key={fc.id} className="diff-file">
                      <div className="diff-file-head">
                        <span>{fc.path}</span>
                        <div className="diff-stats">
                          {fc.additions > 0 && <span className="add">+{fc.additions}</span>}
                          {fc.deletions > 0 && <span className="del">-{fc.deletions}</span>}
                        </div>
                      </div>
                      {fc.diff_text && (
                        <div className="diff-body">
                          {fc.diff_text.split('\n').map((line, i) => (
                            <div
                              key={i}
                              className={`diff-ln ${line.startsWith('+') ? 'plus' : line.startsWith('-') ? 'minus' : ''}`}
                            >
                              <span className="diff-ln-num">{i + 1}</span>
                              <span>{line}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'settings' && (
            <div className="settings enter">
              <div className="settings-heading">Detected Sources</div>
              <div className="settings-sub">AI tools found on your system</div>
              {sources.map((s) => (
                <div key={s.agent_slug} className={`source-row ${s.detected ? 'found' : ''}`}>
                  <div className={`source-dot ${s.detected ? 'on' : ''}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="source-name">{s.name}</div>
                    <div className="source-evidence">
                      {s.detected ? s.root_paths.join(', ') : s.evidence}
                    </div>
                  </div>
                </div>
              ))}

              <div className="settings-heading" style={{ marginTop: 32 }}>Database</div>
              <div className="settings-sub">Manage your local index</div>
              {stats && (
                <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-3)' }}>
                  {stats.total_sessions} sessions, {stats.total_messages} messages across {stats.total_tools} tools
                </div>
              )}
              <div className="danger-box">
                <p>Permanently clear all indexed sessions and messages.</p>
                <button onClick={async () => {
                  if (confirm('Delete all indexed data?')) {
                    await api.clearDatabase();
                    await loadSessions();
                    await loadMeta();
                  }
                }}>Clear Database</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
