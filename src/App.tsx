import { useCallback, useEffect, useRef, useState } from 'react';

import * as api from './api';
import { BackIcon, MenuIcon, ModelIcon, SearchIcon, StarIcon } from './components/AppIcons';
import LandingHero from './components/LandingHero';
import MultiSelectFilter from './components/MultiSelectFilter';
import SearchResults from './components/SearchResults';
import SessionDetail from './components/SessionDetail';
import SessionFeed from './components/SessionFeed';
import SettingsPanel from './components/SettingsPanel';
import Sidebar from './components/Sidebar';
import { downloadExportFile } from './lib/download';
import { DATE_FILTERS, formatDateFilterLabel, getDateRange, getRepoShortName } from './lib/session-format';
import { toolCssClass } from './lib/tool-style';
import type { ActivityPoint, DateFilter, DetectedSource, SearchResult, Session, SessionSummary, Stats, View } from './types';
import './styles.css';

const RESULT_LIMIT = 200;
const SEARCH_DEBOUNCE_MS = 160;
const INCREMENTAL_SCAN_INTERVAL_MS = 30_000;
const INCREMENTAL_SCAN_LOOKBACK_MS = 30_000;
const SESSION_REFRESH_INTERVAL_MS = 10_000;
const MOBILE_SIDEBAR_QUERY = '(max-width: 900px)';

export default function App() {
  const [view, setView] = useState<View>('timeline');
  const [prevView, setPrevView] = useState<View>('timeline');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchToolFilters, setSearchToolFilters] = useState<string[]>([]);
  const [searchPathFilters, setSearchPathFilters] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [searchPaths, setSearchPaths] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [sources, setSources] = useState<DetectedSource[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [toolFilter, setToolFilter] = useState<string | undefined>();
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileSidebar, setIsMobileSidebar] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.matchMedia(MOBILE_SIDEBAR_QUERY).matches;
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOriginViewRef = useRef<View>('timeline');
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const [availableTools, availablePaths, currentStats, currentActivity] = await Promise.all([
        api.getTools(),
        api.getSearchPaths(),
        api.getStats(),
        api.getActivityHeatmap(),
      ]);
      setTools(availableTools);
      setSearchPaths(availablePaths);
      setStats(currentStats);
      setActivity(currentActivity);
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
        limit: RESULT_LIMIT,
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
      const favorites = await api.getFavorites(RESULT_LIMIT, 0);
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
      tools: searchToolFilters,
      paths: searchPathFilters,
      dateFrom: range.from,
      dateTo: range.to,
      limit: RESULT_LIMIT,
    });
  }, [dateFilter, searchPathFilters, searchToolFilters]);

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
    setSearchToolFilters((currentFilters) => currentFilters.filter((tool) => tools.includes(tool)));
  }, [tools]);

  useEffect(() => {
    setSearchPathFilters((currentFilters) => currentFilters.filter((path) => searchPaths.includes(path)));
  }, [searchPaths]);

  useEffect(() => {
    const runIncrementalScan = async () => {
      try {
        const count = await api.scanIncremental(
          new Date(Date.now() - INCREMENTAL_SCAN_LOOKBACK_MS).toISOString(),
        );

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
    }, INCREMENTAL_SCAN_INTERVAL_MS);

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
    }, SESSION_REFRESH_INTERVAL_MS);

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
    }, SEARCH_DEBOUNCE_MS);

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
      downloadExportFile(data);
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
      setSearchToolFilters([]);
      setSearchPathFilters([]);
      clearSearch();
      setView('timeline');
      await Promise.all([loadMeta(), loadTimelineSessions(), loadSources()]);
    } catch (error) {
      console.error('Failed to clear database:', error);
    }
  }, [clearSearch, loadMeta, loadSources, loadTimelineSessions]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(MOBILE_SIDEBAR_QUERY);
    const syncMobileSidebar = (matches: boolean) => {
      setIsMobileSidebar(matches);
      if (!matches) {
        setSidebarOpen(false);
      }
    };
    const handleChange = (event: MediaQueryListEvent) => {
      syncMobileSidebar(event.matches);
    };

    syncMobileSidebar(mediaQueryList.matches);

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange);
      return () => mediaQueryList.removeEventListener('change', handleChange);
    }

    mediaQueryList.addListener(handleChange);
    return () => mediaQueryList.removeListener(handleChange);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (event.key !== 'Escape') {
        return;
      }

      if (sidebarOpen) {
        setSidebarOpen(false);
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
  }, [clearSearch, prevView, sidebarOpen, view]);

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {isMobileSidebar && sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="sidebar-backdrop"
          onClick={closeSidebar}
          type="button"
        />
      )}
      <Sidebar
        mobileOpen={sidebarOpen}
        onClose={closeSidebar}
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
          <button
            aria-expanded={sidebarOpen}
            aria-label="Open navigation"
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <MenuIcon />
          </button>

          {view !== 'session' && view !== 'settings' && (
            <div className="topbar-search-controls">
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

              <div className="search-filter-row">
                <MultiSelectFilter
                  emptyMessage="No tools indexed yet"
                  label="Tool"
                  onChange={setSearchToolFilters}
                  options={tools}
                  placeholder="All tools"
                  selectedValues={searchToolFilters}
                  getSummaryLabel={(selectedValues) => (
                    selectedValues.length === 1 ? selectedValues[0] : `${selectedValues.length} tools`
                  )}
                />
                <MultiSelectFilter
                  emptyMessage="No paths indexed yet"
                  label="Path"
                  onChange={setSearchPathFilters}
                  options={searchPaths}
                  placeholder="All paths"
                  selectedValues={searchPathFilters}
                  getOptionDescription={(value) => value}
                  getOptionLabel={(value) => getRepoShortName(value)}
                  getSummaryLabel={(selectedValues) => (
                    selectedValues.length === 1 ? getRepoShortName(selectedValues[0]) : `${selectedValues.length} paths`
                  )}
                />
              </div>
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
              <LandingHero
                activity={activity}
                stats={stats}
                onScan={() => void handleScan()}
                scanning={scanning}
              />
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
