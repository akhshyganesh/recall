import { useCallback, useEffect, useRef, useState } from 'react';

import { openUrl } from '@tauri-apps/plugin-opener';

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
import { fetchLatestRelease, isNewerVersion } from './lib/release-check';
import { DATE_FILTERS, formatDateFilterLabel, getDateRange, getRepoShortName } from './lib/session-format';
import { toolCssClass } from './lib/tool-style';
import type {
  ActivityPoint,
  AppInfo,
  DateFilter,
  DetectedSource,
  OpenTab,
  SearchResult,
  Session,
  SessionSummary,
  Stats,
  UpdateStatus,
  View,
} from './types';
import './styles.css';

const RESULT_LIMIT = 200;
const SEARCH_DEBOUNCE_MS = 160;
const INCREMENTAL_SCAN_INTERVAL_MS = 30_000;
const INCREMENTAL_SCAN_LOOKBACK_MS = 30_000;
const SESSION_REFRESH_INTERVAL_MS = 10_000;
const MOBILE_SIDEBAR_QUERY = '(max-width: 900px)';

const INITIAL_UPDATE_STATUS: UpdateStatus = {
  state: 'idle',
  current_version: null,
  latest_version: null,
  release_url: null,
  release_date: null,
  release_notes: null,
  checked_at: null,
  error: null,
};

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [view, setView] = useState<View>('timeline');
  const [prevView, setPrevView] = useState<View>('timeline');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [toolFilters, setToolFilters] = useState<string[]>([]);
  const [searchPathFilters, setSearchPathFilters] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [searchPaths, setSearchPaths] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [sources, setSources] = useState<DetectedSource[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(INITIAL_UPDATE_STATUS);
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

  const loadAppInfo = useCallback(async () => {
    try {
      const info = await api.getAppInfo();
      setAppInfo(info);
      setUpdateStatus((current) => ({ ...current, current_version: info.current_version }));
      return info;
    } catch (error) {
      console.error('Failed to load app info:', error);
      return null;
    }
  }, []);

  const checkForUpdates = useCallback(async (info?: AppInfo | null) => {
    const currentInfo = info ?? appInfo;
    const currentVersion = currentInfo?.current_version ?? null;

    setUpdateStatus((current) => ({
      ...current,
      state: 'checking',
      current_version: currentVersion,
      error: null,
    }));

    try {
      const release = await fetchLatestRelease();
      const checkedAt = new Date().toISOString();

      if (currentVersion && isNewerVersion(release.version, currentVersion)) {
        setUpdateStatus({
          state: 'available',
          current_version: currentVersion,
          latest_version: release.version,
          release_url: release.release_url,
          release_date: release.release_date,
          release_notes: release.release_notes,
          checked_at: checkedAt,
          error: null,
        });
        return;
      }

      setUpdateStatus({
        state: 'up-to-date',
        current_version: currentVersion,
        latest_version: release.version,
        release_url: release.release_url,
        release_date: release.release_date,
        release_notes: release.release_notes,
        checked_at: checkedAt,
        error: null,
      });
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateStatus((current) => ({
        ...current,
        state: 'error',
        checked_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Failed to check for updates.',
      }));
    }
  }, [appInfo]);

  const handleOpenReleasePage = useCallback(async () => {
    const target = updateStatus.release_url ?? appInfo?.releases_url;

    if (!target) {
      return;
    }

    try {
      await openUrl(target);
    } catch (error) {
      console.error('Failed to open release page:', error);
    }
  }, [appInfo?.releases_url, updateStatus.release_url]);

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
        tool: toolFilters.length === 1 ? toolFilters[0] : undefined,
        dateFrom: range.from,
        dateTo: range.to,
        limit: RESULT_LIMIT,
      });

      if (toolFilters.length > 1) {
        setSessions(data.filter((s) => toolFilters.includes(s.tool)));
      } else {
        setSessions(data);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, toolFilters]);

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
      tools: toolFilters,
      paths: searchPathFilters,
      dateFrom: range.from,
      dateTo: range.to,
      limit: RESULT_LIMIT,
    });
  }, [dateFilter, searchPathFilters, toolFilters]);

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
    let cancelled = false;

    const initialize = async () => {
      const info = await loadAppInfo();

      if (!cancelled && info) {
        await checkForUpdates(info);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [checkForUpdates, loadAppInfo]);

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
    setToolFilters((currentFilters) => currentFilters.filter((tool) => tools.includes(tool)));
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

      setOpenTabs((tabs) => {
        if (tabs.some((t) => t.id === id)) {
          return tabs;
        }

        return [...tabs, {
          id,
          title: session.title || 'Untitled Session',
          tool: session.tool,
          pinned: false,
        }];
      });
    } catch (error) {
      console.error('Failed to open session:', error);
    }
  }, [view]);

  const closeTab = useCallback((tabId: string) => {
    setOpenTabs((tabs) => tabs.filter((t) => t.id !== tabId));

    if (selectedSession?.id === tabId) {
      setSelectedSession(null);
      setView(prevView);
    }
  }, [prevView, selectedSession?.id]);

  const togglePinTab = useCallback((tabId: string) => {
    setOpenTabs((tabs) => tabs.map((t) => (
      t.id === tabId ? { ...t, pinned: !t.pinned } : t
    )));
  }, []);

  const selectTab = useCallback((tabId: string) => {
    void (async () => {
      try {
        const session = await api.getSession(tabId);

        if (!session) {
          setOpenTabs((tabs) => tabs.filter((t) => t.id !== tabId));
          return;
        }

        setSelectedSession(session);

        if (view !== 'session') {
          setPrevView(view);
        }

        setView('session');
      } catch (error) {
        console.error('Failed to open session tab:', error);
      }
    })();
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
      setToolFilters([]);
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
        activeSessionId={selectedSession?.id ?? null}
        mobileOpen={sidebarOpen}
        onClose={closeSidebar}
        onCloseTab={closeTab}
        onFavorites={() => {
          clearSearch();
          setView('favorites');
        }}
        onOpenReleasePage={() => {
          void handleOpenReleasePage();
        }}
        onScan={() => {
          void handleScan();
        }}
        onSelectTab={selectTab}
        onSettings={() => {
          clearSearch();
          setView('settings');
        }}
        onTimeline={() => {
          clearSearch();
          setView('timeline');
        }}
        onTogglePinTab={togglePinTab}
        openTabs={openTabs}
        scanning={scanning}
        stats={stats}
        updateStatus={updateStatus}
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
                  onChange={setToolFilters}
                  options={tools}
                  placeholder="All tools"
                  selectedValues={toolFilters}
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
            <SettingsPanel
              appInfo={appInfo}
              onCheckForUpdates={() => {
                void checkForUpdates();
              }}
              onClearDatabase={handleClearDatabase}
              onOpenReleasePage={() => {
                void handleOpenReleasePage();
              }}
              sources={sources}
              updateStatus={updateStatus}
            />
          )}
        </div>
      </main>
    </div>
  );
}
