import { useCallback, useEffect, useRef, useState } from 'react';

import * as api from './api';
import { BackIcon, ModelIcon, SearchIcon, StarIcon } from './components/AppIcons';
import SearchResults from './components/SearchResults';
import SessionDetail from './components/SessionDetail';
import SessionFeed from './components/SessionFeed';
import SettingsPanel from './components/SettingsPanel';
import Sidebar from './components/Sidebar';
import { DATE_FILTERS, formatDateFilterLabel, getDateRange } from './lib/session-format';
import { toolCssClass } from './lib/tool-style';
import type { DateFilter, DetectedSource, SearchResult, Session, SessionSummary, Stats, View } from './types';
import './styles.css';

export default function App() {
  const [view, setView] = useState<View>('timeline');
  const [prevView, setPrevView] = useState<View>('timeline');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [tools, setTools] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sources, setSources] = useState<DetectedSource[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [toolFilter, setToolFilter] = useState<string | undefined>();
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOriginViewRef = useRef<View>('timeline');

  const loadMeta = useCallback(async () => {
    try {
      const [availableTools, currentStats] = await Promise.all([api.getTools(), api.getStats()]);
      setTools(availableTools);
      setStats(currentStats);
    } catch (error) {
      console.error('Failed to load metadata:', error);
    }
  }, []);

  const loadTimelineSessions = useCallback(async () => {
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
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, toolFilter]);

  const loadFavorites = useCallback(async () => {
    setLoading(true);

    try {
      const favorites = await api.getFavorites(200, 0);
      setSessions(favorites);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const detectedSources = await api.detectSources();
      setSources(detectedSources);
    } catch (error) {
      console.error('Failed to detect sources:', error);
    }
  }, []);

  const runSearch = useCallback(async (query: string) => {
    const range = getDateRange(dateFilter);
    return api.searchSessions({
      query,
      tool: toolFilter,
      dateFrom: range.from,
      dateTo: range.to,
      limit: 200,
    });
  }, [dateFilter, toolFilter]);

  const refreshSelectedSession = useCallback(async () => {
    if (!selectedSession) {
      return;
    }

    try {
      const updated = await api.getSession(selectedSession.id);

      if (!updated) {
        setSelectedSession(null);
        setView(prevView);
        return;
      }

      setSelectedSession(updated);
    } catch {
      // Ignore refresh failures while the source file may still be changing.
    }
  }, [prevView, selectedSession]);

  const refreshCurrentView = useCallback(async () => {
    if (view === 'timeline') {
      await loadTimelineSessions();
      return;
    }

    if (view === 'favorites') {
      await loadFavorites();
      return;
    }

    if (view === 'search' && searchQuery.trim()) {
      const results = await runSearch(searchQuery.trim());
      setSearchResults(results);
      return;
    }

    if (view === 'settings') {
      await loadSources();
      return;
    }

    if (view === 'session') {
      await refreshSelectedSession();
    }
  }, [loadFavorites, loadSources, loadTimelineSessions, refreshSelectedSession, runSearch, searchQuery, view]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (view === 'timeline') {
      void loadTimelineSessions();
      return;
    }

    if (view === 'favorites') {
      void loadFavorites();
      return;
    }

    if (view === 'settings') {
      void loadSources();
    }
  }, [loadFavorites, loadSources, loadTimelineSessions, view]);

  useEffect(() => {
    const runIncrementalScan = async () => {
      try {
        const count = await api.scanIncremental(new Date(Date.now() - 30_000).toISOString());

        if (count > 0) {
          await loadMeta();
          await refreshCurrentView();
        }
      } catch (error) {
        console.error('[recall] Incremental scan failed:', error);
      }
    };

    const interval = window.setInterval(() => {
      void runIncrementalScan();
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [loadMeta, refreshCurrentView]);

  useEffect(() => {
    if (view !== 'session' || !selectedSession) {
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const updated = await api.getSession(selectedSession.id);

        if (!cancelled && updated) {
          setSelectedSession(updated);
        }
      } catch {
        // Ignore refresh failures while the session is still being indexed.
      }
    };

    const interval = window.setInterval(() => {
      void refresh();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedSession, view]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (!query) {
      setSearching(false);
      setSearchResults([]);

      if (view === 'search') {
        setView(searchOriginViewRef.current);
      }

      return;
    }

    if (view !== 'search') {
      searchOriginViewRef.current = view;
      setView('search');
    }

    let cancelled = false;
    setSearching(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await runSearch(query);

        if (!cancelled) {
          setSearchResults(results);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Search failed:', error);
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [runSearch, searchQuery, view]);

  const handleScan = useCallback(async () => {
    setScanning(true);

    try {
      await api.scanAll();
      await loadMeta();
      await refreshCurrentView();
    } catch (error) {
      console.error('Scan failed:', error);
    } finally {
      setScanning(false);
    }
  }, [loadMeta, refreshCurrentView]);

  const openSession = useCallback(async (id: string) => {
    try {
      const session = await api.getSession(id);

      if (!session) {
        return;
      }

      setSelectedSession(session);
      setPrevView(view);
      setView('session');
    } catch (error) {
      console.error('Failed to open session:', error);
    }
  }, [view]);

  const toggleFavorite = useCallback(async (sessionId: string) => {
    try {
      await api.toggleFavorite(sessionId);
      await loadMeta();

      if (view === 'favorites') {
        await loadFavorites();
        return;
      }

      await loadTimelineSessions();
    } catch (error) {
      console.error('Toggle favorite failed:', error);
    }
  }, [loadFavorites, loadMeta, loadTimelineSessions, view]);

  const handleExport = useCallback(async (format: 'markdown' | 'json' | 'text') => {
    if (!selectedSession) {
      return;
    }

    try {
      const data = await api.exportSession(selectedSession.id, format);
      const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [selectedSession]);

  const handleClearDatabase = useCallback(async () => {
    if (!window.confirm('Delete all indexed data?')) {
      return;
    }

    try {
      await api.clearDatabase();
      setSelectedSession(null);
      setSessions([]);
      clearSearch();
      setView('timeline');
      await Promise.all([loadMeta(), loadTimelineSessions(), loadSources()]);
    } catch (error) {
      console.error('Failed to clear database:', error);
    }
  }, [clearSearch, loadMeta, loadSources, loadTimelineSessions]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (event.key !== 'Escape') {
        return;
      }

      if (view === 'session') {
        setView(prevView);
        setSelectedSession(null);
        return;
      }

      if (view === 'search') {
        clearSearch();
        setView(searchOriginViewRef.current);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearSearch, prevView, view]);

  return (
    <div className="app">
      <Sidebar
        onFavorites={() => {
          clearSearch();
          setView('favorites');
        }}
        onScan={() => {
          void handleScan();
        }}
        onSettings={() => {
          clearSearch();
          setView('settings');
        }}
        onTimeline={() => {
          clearSearch();
          setToolFilter(undefined);
          setView('timeline');
        }}
        onToolSelect={(tool) => {
          clearSearch();
          setToolFilter((currentTool) => (currentTool === tool ? undefined : tool));
          setView('timeline');
        }}
        scanning={scanning}
        stats={stats}
        toolFilter={toolFilter}
        tools={tools}
        view={view}
      />

      <main className="main">
        <div className="topbar">
          {view !== 'session' && view !== 'settings' && (
            <div className="search-box">
              <span className="search-icon-el"><SearchIcon /></span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search sessions, prompts, code…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <span className="kbd-hint">⌘K</span>
            </div>
          )}

          {(view === 'timeline' || view === 'search') && (
            <div className="chip-bar">
              {DATE_FILTERS.map((filter) => (
                <button
                  key={filter}
                  className={`chip ${dateFilter === filter ? 'on' : ''}`}
                  onClick={() => setDateFilter(filter)}
                  type="button"
                >
                  {formatDateFilterLabel(filter)}
                </button>
              ))}
            </div>
          )}

          {view === 'session' && selectedSession && (
            <div className="topbar-session-info">
              <button
                className="topbar-back-btn"
                onClick={() => {
                  setView(prevView);
                  setSelectedSession(null);
                }}
                type="button"
              >
                <BackIcon />
              </button>
              <span className="topbar-session-title">{selectedSession.title || 'Untitled Session'}</span>
              <span className={`tool-pill ${toolCssClass(selectedSession.tool)}`}>{selectedSession.tool}</span>
              {selectedSession.model && (
                <span className="session-meta-chip">
                  <ModelIcon />
                  <span>{selectedSession.model}</span>
                </span>
              )}
              <span className="session-message-count">
                {selectedSession.messages.length} message{selectedSession.messages.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>

        <div className="content">
          {view === 'timeline' && (
            <div className="enter">
              <SessionFeed
                emptyState={{
                  icon: <SearchIcon />,
                  title: 'No sessions found',
                  description: 'Scan your system to discover AI coding session history from Copilot, Claude Code, Cursor, Aider, and more.',
                  action: (
                    <button className="primary-btn" onClick={() => void handleScan()} type="button">
                      {scanning ? 'Scanning…' : 'Scan for Sessions'}
                    </button>
                  ),
                }}
                grouped
                loading={loading}
                onOpen={openSession}
                onToggleFavorite={toggleFavorite}
                sessions={sessions}
              />
            </div>
          )}

          {view === 'favorites' && (
            <div className="enter">
              <SessionFeed
                emptyState={{
                  icon: <StarIcon />,
                  title: 'No favorites yet',
                  description: 'Star sessions you want to find quickly later.',
                }}
                loading={loading}
                onOpen={openSession}
                sessions={sessions}
                showFavoriteToggle={false}
              />
            </div>
          )}

          {view === 'search' && (
            <div className="enter">
              <SearchResults
                emptyStateIcon={<SearchIcon />}
                loading={searching}
                onOpen={openSession}
                query={searchQuery}
                results={searchResults}
              />
            </div>
          )}

          {view === 'session' && selectedSession && (
            <SessionDetail onExport={handleExport} session={selectedSession} />
          )}

          {view === 'settings' && (
            <SettingsPanel onClearDatabase={handleClearDatabase} sources={sources} stats={stats} />
          )}
        </div>
      </main>
    </div>
  );
}