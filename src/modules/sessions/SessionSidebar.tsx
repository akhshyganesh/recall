import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Clock01Icon,
  Copy01Icon,
  DatabaseIcon,
  FolderSearchIcon,
  Refresh01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ActivityHeatmap } from "./ActivityHeatmap";
import {
  getActivityHeatmap,
  getDistinctAgents,
  getSessions,
  getStats,
  scanAll,
  scanIncremental,
  searchSessions,
  type ActivityPoint,
  type DistinctAgent,
  type SearchResult,
  type SessionSummary,
  type Stats,
} from "./api";
import { getToolTheme } from "./toolStyle";

const AUTO_INCREMENTAL_SCAN_MS = 2 * 60 * 1000;

type Props = {
  contextPath: string | null;
  repoRoot: string | null;
  onOpenSession: (sessionId: string, title: string) => void;
};

function basename(path: string | null): string {
  if (!path) return "Workspace";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function compactPath(path: string | null): string {
  if (!path) return "No active path";
  const normalized = path.replace(/\\/g, "/");
  const home = normalized.match(/^\/Users\/([^/]+)(\/.*)?$/);
  if (home) return `~${home[2] ?? ""}`;
  return normalized;
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stripSnippet(value: string | null | undefined): string | null {
  const text = value?.replace(/<\/?mark>/g, "").replace(/…/g, "...").trim();
  return text || null;
}

function rowFromSearch(result: SearchResult): SessionSummary & { snippet?: string } {
  return {
    id: result.id,
    tool: result.tool,
    agent_slug: result.agent_slug,
    external_id: null,
    title: result.title,
    repo_name: result.repo_name,
    repo_path: result.repo_path,
    started_at: result.started_at,
    ended_at: null,
    message_count: result.message_count,
    file_count: 0,
    model: result.model,
    workspace: result.workspace,
    is_favorite: false,
    snippet: stripSnippet(result.snippet) ?? undefined,
  };
}

export function SessionSidebar({ contextPath, repoRoot, onOpenSession }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [view, setView] = useState<"recent" | "all">("recent");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [agents, setAgents] = useState<DistinctAgent[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoScanCursorRef = useRef(new Date().toISOString());
  const scopePath = contextPath ?? repoRoot;
  const scopePaths = useMemo(() => (scopePath ? [scopePath] : undefined), [scopePath]);
  const effectivePaths = view === "recent" ? scopePaths : undefined;
  const contextLabel = useMemo(
    () => basename(scopePath),
    [scopePath],
  );
  const contextKey = scopePath ?? "global";

  const loadDashboard = useCallback(async () => {
    try {
      const [nextSessions, nextStats, nextActivity, nextAgents] = await Promise.all([
        getSessions({ limit: 80, paths: effectivePaths, agentSlug: activeSlug ?? undefined }),
        getStats(effectivePaths),
        getActivityHeatmap(84, effectivePaths),
        getDistinctAgents(),
      ]);
      setSessions(nextSessions);
      setStats(nextStats);
      setActivity(nextActivity);
      setAgents(nextAgents);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [effectivePaths, activeSlug]);

  const runScan = useCallback(async () => {
    setIndexing(true);
    setError(null);
    try {
      await scanAll();
      autoScanCursorRef.current = new Date().toISOString();
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    } finally {
      setIndexing(false);
    }
  }, [loadDashboard]);

  const runIncrementalScan = useCallback(async () => {
    if (indexing) return;
    setIndexing(true);
    setError(null);
    const nextCursor = new Date().toISOString();
    try {
      await scanIncremental(autoScanCursorRef.current);
      autoScanCursorRef.current = nextCursor;
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    } finally {
      setIndexing(false);
    }
  }, [indexing, loadDashboard]);

  useEffect(() => {
    setLoading(true);
    setSessions([]);
    setSearchResults([]);
    setStats(null);
    setActivity([]);
    setActiveSlug(null);
  }, [contextKey, view]);

  useEffect(() => {
    void loadDashboard();
    const interval = window.setInterval(() => void loadDashboard(), 5000);
    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    const interval = window.setInterval(
      () => void runIncrementalScan(),
      AUTO_INCREMENTAL_SCAN_MS,
    );
    return () => window.clearInterval(interval);
  }, [runIncrementalScan]);

  useEffect(() => {
    if (!deferredQuery) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void searchSessions({ query: deferredQuery, limit: 80, paths: effectivePaths, agentSlugs: activeSlug ? [activeSlug] : undefined })
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch((err) => {
          if (!cancelled) setError(String(err));
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [deferredQuery, effectivePaths, activeSlug]);

  const rows = useMemo(
    () => (deferredQuery ? searchResults.map(rowFromSearch) : sessions),
    [deferredQuery, searchResults, sessions],
  );

  return (
    <aside className="flex h-full min-h-0 flex-col bg-card">
      <header className="shrink-0 border-b border-border/60 px-3 pb-3 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/6 text-foreground">
            <HugeiconsIcon icon={DatabaseIcon} size={15} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-foreground">
              Sessions {indexing ? "scanning" : ""}
            </div>
            <div className="truncate text-[10.5px] text-muted-foreground">
              {contextLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void runScan()}
            disabled={indexing}
            title="Scan sessions"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground disabled:opacity-50"
          >
            <HugeiconsIcon
              icon={Refresh01Icon}
              size={14}
              strokeWidth={1.9}
              className={cn(indexing && "animate-spin")}
            />
          </button>
        </div>

        <label className="mt-3 flex h-8 items-center gap-2 rounded-md border border-border/50 bg-background/80 px-2 focus-within:border-primary/40">
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            strokeWidth={2}
            className="shrink-0 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions"
            className="h-7 rounded-none border-0 bg-transparent px-0 py-0 text-[12px] shadow-none focus-visible:ring-0"
          />
        </label>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: "Sessions", value: stats?.total_sessions ?? 0 },
            { label: "Messages", value: stats?.total_messages ?? 0 },
            { label: "Tools", value: stats?.total_tools ?? 0 },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-md border border-border/40 bg-card p-2"
            >
              <div className="text-[13px] font-semibold tabular-nums text-foreground">
                {item.value.toLocaleString()}
              </div>
              <div className="mt-0.5 truncate text-[9.5px] text-muted-foreground">
                {item.label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {([
            { label: contextLabel, icon: Clock01Icon, value: "recent" as const },
            { label: "All", icon: DatabaseIcon, value: "all" as const },
          ] as const).map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setView(item.value)}
              className={cn(
                "flex h-7 items-center justify-center gap-1.5 rounded-md border text-[11px] font-medium transition-colors",
                view === item.value
                  ? "border-border/60 bg-foreground/6 text-foreground"
                  : "border-border/35 text-muted-foreground hover:bg-foreground/4 hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={item.icon} size={12} strokeWidth={1.9} />
              {item.label}
            </button>
          ))}
        </div>

        {agents.length > 1 && (
          <div className="no-scrollbar mt-2 flex gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveSlug(null)}
              className={cn(
                "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors",
                activeSlug === null
                  ? "border-border/60 bg-foreground/8 text-foreground"
                  : "border-border/30 text-muted-foreground hover:bg-foreground/4 hover:text-foreground",
              )}
            >
              All
            </button>
            {agents.map((agent) => {
              const theme = getToolTheme(agent.tool);
              const active = activeSlug === agent.agent_slug;
              return (
                <button
                  key={agent.agent_slug}
                  type="button"
                  onClick={() => setActiveSlug(active ? null : agent.agent_slug)}
                  className={cn(
                    "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors",
                    active
                      ? "border-border/60 bg-foreground/8 text-foreground"
                      : "border-border/30 text-muted-foreground hover:bg-foreground/4 hover:text-foreground",
                  )}
                  style={active ? { borderColor: `rgba(${theme.rgb},0.5)`, color: `rgb(${theme.rgb})` } : undefined}
                  title={`${agent.tool} — ${agent.count} sessions`}
                >
                  {theme.label}
                  <span className="ml-1 opacity-50">{agent.count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-2">
          <ActivityHeatmap activity={activity} />
        </div>

        {error && (
          <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
            {error}
          </div>
        )}

        <div className="mt-2 flex flex-col gap-1.5">
          {loading ? (
            <EmptyState
              icon={DatabaseIcon}
              title="Loading sessions"
              detail={compactPath(scopePath)}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FolderSearchIcon}
              title={indexing ? "Indexing sessions" : "No indexed sessions yet"}
              detail={compactPath(scopePath)}
            />
          ) : (
            rows.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onOpen={() => onOpenSession(session.id, session.title || "Untitled session")}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: typeof FolderSearchIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-card p-2.5">
      <div className="flex items-start gap-2">
        <HugeiconsIcon
          icon={icon}
          size={15}
          strokeWidth={1.9}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-foreground">{title}</div>
          <div className="mt-1 truncate text-[10.5px] text-muted-foreground" title={detail}>
            {detail}
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionRow({
  session,
  onOpen,
}: {
  session: SessionSummary & { snippet?: string };
  onOpen: () => void;
}) {
  const title = session.title || "Untitled session";
  const repo = session.repo_name || basename(session.repo_path ?? session.workspace);
  const displayId = session.external_id
    ? session.external_id.slice(0, 12)
    : session.id.slice(0, 8);
  const fullId = session.external_id ?? session.id;

  const copyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(fullId);
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full rounded-md border border-border/35 bg-card/70 p-2 text-left transition-colors hover:border-border/60 hover:bg-sidebar-accent/40"
      title={title}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-foreground">{title}</div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="truncate">{session.tool}</span>
            <span className="shrink-0 text-muted-foreground/45">/</span>
            <span className="truncate">{repo}</span>
          </div>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {session.message_count}
        </span>
      </div>
      {session.snippet && (
        <div className="mt-1.5 line-clamp-2 text-[10.5px] leading-4 text-muted-foreground">
          {session.snippet}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
        <HugeiconsIcon icon={Clock01Icon} size={10} strokeWidth={1.8} />
        <span className="truncate">{formatDate(session.started_at)}</span>
        {session.model && (
          <span className="ml-auto shrink-0 max-w-[72px] truncate text-muted-foreground/60" title={session.model}>
            {session.model.split("/").pop()}
          </span>
        )}
        {!session.model && session.file_count > 0 && (
          <span className="ml-auto shrink-0">{session.file_count} files</span>
        )}
        <button
          type="button"
          onClick={copyId}
          title={`Copy session ID: ${fullId}`}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded px-1 py-0.5 font-mono text-[9px] text-muted-foreground/50 transition-opacity hover:bg-foreground/6 hover:text-muted-foreground",
            session.model ? "opacity-0 group-hover:opacity-100" : "ml-auto opacity-0 group-hover:opacity-100",
          )}
        >
          <HugeiconsIcon icon={Copy01Icon} size={8} strokeWidth={1.8} />
          {displayId}
        </button>
      </div>
    </button>
  );
}
