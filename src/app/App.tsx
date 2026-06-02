import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { native } from "@/lib/native";
import {
  EditorStack,
  GitDiffStack,
  NewEditorDialog,
  type EditorPaneHandle,
} from "@/modules/editor";
import {
  GitHistoryStack,
  type GitHistorySearchHandle,
} from "@/modules/git-history";
import { getLaunchDir } from "@/lib/launchDir";
import { useZoom } from "@/lib/useZoom";
import { FileExplorer, QuickOpen, type FileExplorerHandle } from "@/modules/explorer";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import { MarkdownStack } from "@/modules/markdown";
import {
  MediaStack,
  PreviewStack,
  type PreviewPaneHandle,
} from "@/modules/preview";
import {
  listenSettingsTabRequests,
  settingsTabTitle,
} from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setSessionsMcpEnabled as applySessionsMcpEnabled } from "@/modules/sessions/api";
import { SessionHistoryStack, SessionSidebar } from "@/modules/sessions";
import {
  useGlobalShortcuts,
  type ShortcutHandlers,
  type ShortcutId,
} from "@/modules/shortcuts";
import { SidebarRail, type SidebarViewId } from "@/modules/sidebar";
import {
  SourceControlPanel,
  useSourceControl,
} from "@/modules/source-control";
import {
  MAX_PANES_PER_TAB,
  useTabs,
  useWorkspaceCwd,
  type MediaKind,
} from "@/modules/tabs";
import {
  disposeSession,
  findLeafCwd,
  hasLeaf,
  leafIds,
  respawnSession,
  TerminalStack,
  type TerminalPaneHandle,
} from "@/modules/terminal";
import { ThemeProvider } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import {
  getWslHome,
  LOCAL_WORKSPACE,
  useWorkspaceEnvStore,
  type WorkspaceEnv,
} from "@/modules/workspace";
import { homeDir } from "@tauri-apps/api/path";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { SettingsPanel } from "@/settings/SettingsApp";

function dirname(path: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized;
  return normalized.slice(0, idx);
}

const IMAGE_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);
const VIDEO_EXTENSIONS = new Set([
  "avi",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "ogv",
  "webm",
]);

function mediaKindForPath(path: string): MediaKind | null {
  const ext = path.split(/[\\/.]/).pop()?.toLowerCase();
  if (!ext) return null;
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

const SIDEBAR_DEFAULT_WIDTH = 260;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_WIDTH_STORAGE_KEY = "recall.sidebar.width";
const SIDEBAR_VIEW_STORAGE_KEY = "recall.sidebar.view.v2";
const GIT_CONTEXT_DEFAULT_WIDTH = 300;
const GIT_CONTEXT_MIN_WIDTH = 240;
const GIT_CONTEXT_MAX_WIDTH = 460;
const GIT_CONTEXT_WIDTH_STORAGE_KEY = "recall.git-context.width";

function clampSidebarWidth(width: number): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)),
  );
}

function readSidebarWidth(): number {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed)
      ? clampSidebarWidth(parsed)
      : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function readSidebarView(): SidebarViewId {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
    if (stored === "sessions" || stored === "explorer") return stored;
  } catch {
    // ignore
  }
  return "explorer";
}

function clampGitContextWidth(width: number): number {
  return Math.min(
    GIT_CONTEXT_MAX_WIDTH,
    Math.max(GIT_CONTEXT_MIN_WIDTH, Math.round(width)),
  );
}

function readGitContextWidth(): number {
  try {
    const stored = window.localStorage.getItem(GIT_CONTEXT_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed)
      ? clampGitContextWidth(parsed)
      : GIT_CONTEXT_DEFAULT_WIDTH;
  } catch {
    return GIT_CONTEXT_DEFAULT_WIDTH;
  }
}

export default function App() {
  const {
    tabs,
    activeId,
    setActiveId,
    newTab,
    openSettingsTab,
    openFileTab,
    openMediaTab,
    openSessionTab,
    pinTab,
    newPreviewTab,
    newMarkdownTab,
    openGitDiffTab,
    openCommitHistoryTab,
    openCommitFileDiffTab,
    closeTab,
    updateTab,
    selectByIndex,
    setLeafCwd,
    focusPane,
    focusNextPaneInTab,
    splitActivePane,
    closeActivePane,
    closePaneByLeaf,
    resetWorkspace,
    reorderTab,
  } = useTabs(getLaunchDir() ? { cwd: getLaunchDir() } : undefined);

  // Mirror `tabs` into a ref so callbacks scheduled with `setTimeout`
  // (e.g. cdInNewTab) read the latest pane state instead of a stale closure.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const activeTerminalTab = useMemo(() => {
    const t = tabs.find((x) => x.id === activeId);
    return t && t.kind === "terminal" ? t : null;
  }, [tabs, activeId]);
  const activeLeafId = activeTerminalTab?.activeLeafId ?? null;

  const searchAddons = useRef<Map<number, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const [gitHistoryHandle, setGitHistoryHandle] =
    useState<GitHistorySearchHandle | null>(null);
  const { zoomIn, zoomOut, zoomReset } = useZoom();
  const explorerRef = useRef<FileExplorerHandle>(null);
  const explorerReturnFocusRef = useRef<HTMLElement | null>(null);

  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const gitContextRef = useRef<PanelImperativeHandle | null>(null);
  const sidebarWidthRef = useRef(readSidebarWidth());
  const gitContextWidthRef = useRef(readGitContextWidth());
  const sidebarWidthWriteTimerRef = useRef(0);
  const gitContextWidthWriteTimerRef = useRef(0);
  const [sidebarView, setSidebarViewState] = useState<SidebarViewId>(readSidebarView);
  const persistSidebarView = useCallback((view: SidebarViewId) => {
    setSidebarViewState(view);
    try {
      window.localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, view);
    } catch {
      // storage may fail in private mode
    }
  }, []);
  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, []);
  const cycleSidebarView = useCallback(
    (view: SidebarViewId) => {
      const panel = sidebarRef.current;
      const collapsed = panel ? panel.getSize().asPercentage <= 0 : false;
      if (collapsed) {
        if (panel) panel.resize(`${sidebarWidthRef.current}px`);
        if (view !== sidebarView) persistSidebarView(view);
        return;
      }
      if (view === sidebarView) {
        panel?.collapse();
        return;
      }
      persistSidebarView(view);
    },
    [persistSidebarView, sidebarView],
  );
  const persistSidebarWidth = useCallback((next: number) => {
    sidebarWidthRef.current = next;
    if (sidebarWidthWriteTimerRef.current) {
      window.clearTimeout(sidebarWidthWriteTimerRef.current);
    }
    sidebarWidthWriteTimerRef.current = window.setTimeout(() => {
      sidebarWidthWriteTimerRef.current = 0;
      try {
        window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
    }, 200);
  }, []);
  const persistGitContextWidth = useCallback((next: number) => {
    gitContextWidthRef.current = next;
    if (gitContextWidthWriteTimerRef.current) {
      window.clearTimeout(gitContextWidthWriteTimerRef.current);
    }
    gitContextWidthWriteTimerRef.current = window.setTimeout(() => {
      gitContextWidthWriteTimerRef.current = 0;
      try {
        window.localStorage.setItem(
          GIT_CONTEXT_WIDTH_STORAGE_KEY,
          String(next),
        );
      } catch {
        // ignore
      }
    }, 200);
  }, []);
  useEffect(() => {
    return () => {
      if (sidebarWidthWriteTimerRef.current) {
        window.clearTimeout(sidebarWidthWriteTimerRef.current);
      }
      if (gitContextWidthWriteTimerRef.current) {
        window.clearTimeout(gitContextWidthWriteTimerRef.current);
      }
    };
  }, []);

  const toggleExplorerFocus = useCallback(() => {
    const explorer = explorerRef.current;
    const panel = sidebarRef.current;
    const collapsed = panel ? panel.getSize().asPercentage <= 0 : false;
    if (sidebarView !== "explorer" || collapsed) {
      if (panel && collapsed) panel.resize(`${sidebarWidthRef.current}px`);
      if (sidebarView !== "explorer") persistSidebarView("explorer");
      const active = document.activeElement;
      explorerReturnFocusRef.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
      requestAnimationFrame(() => explorerRef.current?.focus());
      return;
    }
    if (!explorer) return;
    if (explorer.isFocused()) {
      const target = explorerReturnFocusRef.current;
      explorerReturnFocusRef.current = null;
      if (target && document.body.contains(target)) {
        target.focus();
      } else {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      return;
    }
    const active = document.activeElement;
    explorerReturnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    explorer.focus();
  }, [persistSidebarView, sidebarView]);

  const [home, setHome] = useState<string | null>(null);
  const [pendingCloseTab, setPendingCloseTab] = useState<number | null>(null);
  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const [launchCwd, setLaunchCwd] = useState<string | null>(null);
  const [launchCwdResolved, setLaunchCwdResolved] = useState(false);
  const [pendingDeleteTabs, setPendingDeleteTabs] = useState<number[] | null>(
    null,
  );
  const [gitContextOpen, setGitContextOpen] = useState(true);
  useEffect(() => {
    homeDir()
      .then(async (p) => {
        const normalized = p.replace(/\\/g, "/");
        setHome(normalized);
        try {
          await native.workspaceAuthorize(normalized);
        } catch {
          // Bootstrap already authorizes home from Rust; ignore.
        }
      })
      .catch(() => setHome(null));
  }, []);

  const switchWorkspace = useCallback(
    async (env: WorkspaceEnv) => {
      if (
        env.kind === workspaceEnv.kind &&
        (env.kind === "local" ||
          (workspaceEnv.kind === "wsl" && env.distro === workspaceEnv.distro))
      ) {
        return;
      }
      const dirty = tabsRef.current.some((t) => t.kind === "editor" && t.dirty);
      if (dirty) {
        window.alert("Save or close unsaved editor tabs before switching workspace.");
        return;
      }

      let nextHome: string | null = null;
      try {
        if (env.kind === "wsl") {
          nextHome = await getWslHome(env.distro);
        } else {
          nextHome = (await homeDir()).replace(/\\/g, "/");
        }
      } catch (e) {
        window.alert(String(e));
        return;
      }

      for (const id of liveLeavesRef.current) disposeSession(id);
      searchAddons.current.clear();
      terminalRefs.current.clear();
      editorRefs.current.clear();
      previewRefs.current.clear();
      setActiveSearchAddon(null);
      setActiveEditorHandle(null);
      setWorkspaceEnv(env.kind === "local" ? LOCAL_WORKSPACE : env);
      setHome(nextHome);
      setLaunchCwd(nextHome);
      if (nextHome) {
        try {
          await native.workspaceAuthorize(nextHome);
        } catch {
          // Non-fatal — git panel will surface "not authorized" if needed.
        }
      }
      resetWorkspace(nextHome ?? undefined);
    },
    [workspaceEnv, setWorkspaceEnv, resetWorkspace],
  );
  useEffect(() => {
    native
      .workspaceCurrentDir()
      .then(setLaunchCwd)
      .catch(() => setLaunchCwd(null))
      .finally(() => setLaunchCwdResolved(true));
  }, []);

  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const initPrefs = usePreferencesStore((s) => s.init);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const sessionsMcpEnabled = usePreferencesStore((s) => s.sessionsMcpEnabled);
  useEffect(() => {
    void initPrefs();
  }, [initPrefs]);

  useEffect(() => {
    if (!prefsHydrated) return;
    void applySessionsMcpEnabled(sessionsMcpEnabled).catch((error) => {
      console.error("failed to apply sessions MCP preference", error);
    });
  }, [prefsHydrated, sessionsMcpEnabled]);

  useEffect(() => listenSettingsTabRequests(openSettingsTab), [openSettingsTab]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const activeSettingsTab = activeTab?.kind === "settings" ? activeTab : null;
  const isTerminalTab = activeTab?.kind === "terminal";
  const isEditorTab = activeTab?.kind === "editor";
  const isPreviewTab = activeTab?.kind === "preview";
  const isMarkdownTab = activeTab?.kind === "markdown";
  const isMediaTab = activeTab?.kind === "media";
  const isSessionTab = activeTab?.kind === "session";
  const isGitDiffTab =
    activeTab?.kind === "git-diff" || activeTab?.kind === "git-commit-file";
  const isGitHistoryTab = activeTab?.kind === "git-history";
  const isSettingsTab = activeSettingsTab !== null;

  useEffect(() => {
    type FileWrittenPayload = { path: string; source?: string };
    const unlistenPromise = getCurrentWebviewWindow().listen<FileWrittenPayload>(
      "fs:file-written",
      (event) => {
        if (event.payload.source === "editor") return;
        const normalizedPath = event.payload.path.replace(/\\/g, "/");
        const currentTabs = tabsRef.current;
        for (const t of currentTabs) {
          if (t.kind !== "editor") continue;
          if (t.path.replace(/\\/g, "/") === normalizedPath) {
            editorRefs.current.get(t.id)?.reload();
          }
        }
      },
    );
    return () => {
      void unlistenPromise.then((un) => un());
    };
  }, []);

  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(
    activeTab,
    tabs,
    launchCwd ?? home,
  );

  useEffect(() => {
    setActiveSearchAddon(
      activeLeafId !== null ? (searchAddons.current.get(activeLeafId) ?? null) : null,
    );
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
  }, [activeId, activeLeafId]);

  const handleSearchReady = useCallback(
    (leafId: number, addon: SearchAddon) => {
      searchAddons.current.set(leafId, addon);
      if (leafId === activeLeafId) setActiveSearchAddon(addon);
    },
    [activeLeafId],
  );

  const disposeTab = useCallback(
    (id: number) => {
      // Terminal-leaf-keyed maps (terminalRefs/searchAddons) are pruned by
      // the effect below as the pane tree changes; only the tab-id-keyed
      // handles need explicit cleanup here.
      editorRefs.current.delete(id);
      previewRefs.current.delete(id);
      closeTab(id);
    },
    [closeTab],
  );

  // Drives session disposal off the pane tree, not React lifecycles —
  // split/unsplit re-mount components but the leaf is still live.
  const liveLeavesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const live = new Set<number>();
    for (const t of tabs) {
      if (t.kind === "terminal") {
        for (const id of leafIds(t.paneTree)) live.add(id);
      }
    }
    for (const id of liveLeavesRef.current) {
      if (!live.has(id)) disposeSession(id);
    }
    liveLeavesRef.current = live;
    for (const k of [...terminalRefs.current.keys()])
      if (!live.has(k)) terminalRefs.current.delete(k);
    for (const k of [...searchAddons.current.keys()])
      if (!live.has(k)) searchAddons.current.delete(k);
  }, [tabs]);

  const handleClose = useCallback(
    (id: number) => {
      const t = tabs.find((x) => x.id === id);
      if (t?.kind === "editor" && t.dirty) {
        setPendingCloseTab(id);
        return;
      }
      disposeTab(id);
    },
    [tabs, disposeTab],
  );

  const handleRenameTab = useCallback(
    (id: number, title: string) => updateTab(id, { title }),
    [updateTab],
  );

  const confirmClose = useCallback(() => {
    if (pendingCloseTab !== null) {
      disposeTab(pendingCloseTab);
      setPendingCloseTab(null);
    }
  }, [pendingCloseTab, disposeTab]);

  const cancelClose = useCallback(() => {
    setPendingCloseTab(null);
  }, []);

  const cycleTab = useCallback(
    (delta: 1 | -1) => {
      if (tabs.length < 2) return;
      const idx = tabs.findIndex((t) => t.id === activeId);
      const nextIdx = (idx + delta + tabs.length) % tabs.length;
      setActiveId(tabs[nextIdx].id);
    },
    [tabs, activeId, setActiveId],
  );

  const openNewTab = useCallback(() => {
    newTab(inheritedCwdForNewTab());
  }, [newTab, inheritedCwdForNewTab]);

  const sendCd = useCallback(
    (path: string) => {
      if (activeLeafId === null) return;
      const term = terminalRefs.current.get(activeLeafId);
      if (!term) return;
      const quoted = path.includes(" ")
        ? `'${path.replace(/'/g, `'\\''`)}'`
        : path;
      term.write(`cd ${quoted}\r`);
      term.focus();
    },
    [activeLeafId],
  );

  const cdInNewTab = useCallback(
    (path: string) => {
      const tabId = newTab(path);
      setTimeout(() => {
        const tab = tabsRef.current.find((x) => x.id === tabId);
        if (!tab || tab.kind !== "terminal") return;
        const t = terminalRefs.current.get(tab.activeLeafId);
        if (!t) return;
        const quoted = path.includes(" ")
          ? `'${path.replace(/'/g, `'\\''`)}'`
          : path;
        t.write(`cd ${quoted}\r`);
        t.focus();
      }, 80);
    },
    [newTab],
  );

  const handleOpenFile = useCallback(
    (path: string, pin?: boolean) => {
      const mediaKind = mediaKindForPath(path);
      if (mediaKind) {
        openMediaTab(path, mediaKind, pin ?? false);
        return;
      }
      // Explorer defaults to preview (pin=false); explicit actions like
      // context-menu "Open" pass pin=true for a persistent tab.
      openFileTab(path, pin ?? false);
    },
    [openFileTab, openMediaTab],
  );

  const handleOpenSession = useCallback(
    (sessionId: string, title: string) => {
      openSessionTab(sessionId, title);
    },
    [openSessionTab],
  );

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      for (const t of tabs) {
        if (t.kind !== "editor" && t.kind !== "media") continue;
        if (t.path === from) {
          const i = to.lastIndexOf("/");
          updateTab(t.id, { path: to, title: i === -1 ? to : to.slice(i + 1) });
        } else if (t.path.startsWith(`${from}/`)) {
          const suffix = t.path.slice(from.length);
          const newPath = `${to}${suffix}`;
          const i = newPath.lastIndexOf("/");
          updateTab(t.id, {
            path: newPath,
            title: i === -1 ? newPath : newPath.slice(i + 1),
          });
        }
      }
    },
    [tabs, updateTab],
  );

  const confirmDeleteClose = useCallback(() => {
    if (pendingDeleteTabs !== null) {
      for (const id of pendingDeleteTabs) disposeTab(id);
      setPendingDeleteTabs(null);
    }
  }, [pendingDeleteTabs, disposeTab]);

  const cancelDeleteClose = useCallback(() => {
    setPendingDeleteTabs(null);
  }, []);

  const handlePathDeleted = useCallback(
    (path: string) => {
      const dirty: number[] = [];
      for (const t of tabs) {
        if (t.kind !== "editor" && t.kind !== "media") continue;
        if (t.path !== path && !t.path.startsWith(`${path}/`)) continue;
        if (t.kind === "editor" && t.dirty) {
          dirty.push(t.id);
        } else {
          disposeTab(t.id);
        }
      }
      if (dirty.length > 0) setPendingDeleteTabs(dirty);
    },
    [tabs, disposeTab],
  );

  const activeTerminalLeafCwd =
    activeTab?.kind === "terminal"
      ? (findLeafCwd(activeTab.paneTree, activeTab.activeLeafId) ??
        activeTab.cwd ??
        null)
      : null;

  const activeFilePath = (() => {
    if (activeTab?.kind === "editor") return activeTab.path;
    if (activeTab?.kind === "media") return activeTab.path;
    if (activeTab?.kind === "git-diff") {
      if (/^([A-Za-z]:|\/|\\)/.test(activeTab.path)) return activeTab.path;
      const root = activeTab.repoRoot.replace(/[\\/]+$/, "");
      const rel = activeTab.path.replace(/^[\\/]+/, "");
      return `${root}/${rel}`;
    }
    if (activeTab?.kind === "git-commit-file") {
      const root = activeTab.repoRoot.replace(/[\\/]+$/, "");
      const rel = activeTab.path.replace(/^[\\/]+/, "");
      return `${root}/${rel}`;
    }
    return null;
  })();
  const workspaceFallbackPath = launchCwdResolved
    ? (launchCwd ?? home ?? null)
    : null;
  const sourceControlContextPath = (() => {
    if (activeTab?.kind === "terminal") {
      return activeTerminalLeafCwd ?? explorerRoot ?? workspaceFallbackPath;
    }
    if (activeTab?.kind === "editor") return dirname(activeTab.path);
    if (activeTab?.kind === "media") return dirname(activeTab.path);
    if (activeTab?.kind === "git-diff") return activeTab.repoRoot;
    if (activeTab?.kind === "git-commit-file") return activeTab.repoRoot;
    if (activeTab?.kind === "git-history") return activeTab.repoRoot;
    return explorerRoot ?? workspaceFallbackPath;
  })();
  const sourceControl = useSourceControl(sourceControlContextPath, true);
  const showGitContext = gitContextOpen && sourceControl.hasRepo;
  const branchName = sourceControl.status?.isDetached
    ? "detached"
    : (sourceControl.status?.branch ?? sourceControl.repo?.branch ?? null);
  const branchDivergence =
    sourceControl.ahead > 0 && sourceControl.behind > 0
      ? `↑${sourceControl.ahead} ↓${sourceControl.behind}`
      : sourceControl.ahead > 0
        ? `↑${sourceControl.ahead}`
        : sourceControl.behind > 0
          ? `↓${sourceControl.behind}`
          : null;
  const branchLabel = branchName
    ? branchDivergence
      ? `${branchName} ${branchDivergence}`
      : branchName
    : null;
  const branchTitle = sourceControl.repo
    ? `${sourceControl.repo.repoRoot}${
        sourceControl.upstream ? ` · ${sourceControl.upstream}` : ""
      }`
    : undefined;

  const toggleSourceControl = useCallback(() => {
    if (!sourceControl.hasRepo) return;
    setGitContextOpen((open) => !open);
  }, [sourceControl.hasRepo]);

  useEffect(() => {
    if (!sourceControl.hasRepo) return;

    let retryFrame = 0;
    const applyPanelState = (allowRetry: boolean) => {
      const panel = gitContextRef.current;
      if (!panel) return;
      try {
        if (gitContextOpen) panel.resize(`${gitContextWidthRef.current}px`);
        else panel.collapse();
      } catch (error) {
        if (
          allowRetry &&
          error instanceof Error &&
          error.message.includes("Layout not found for Panel git-context")
        ) {
          retryFrame = window.requestAnimationFrame(() => applyPanelState(false));
          return;
        }
        console.warn("git context panel resize skipped:", error);
      }
    };

    const frame = window.requestAnimationFrame(() => applyPanelState(true));
    return () => {
      window.cancelAnimationFrame(frame);
      if (retryFrame) window.cancelAnimationFrame(retryFrame);
    };
  }, [gitContextOpen, sourceControl.hasRepo]);

  const openGitGraphFromContext = useCallback(async () => {
    const known = sourceControl.hasRepo ? sourceControl.repo : null;
    if (known) {
      openCommitHistoryTab({
        repoRoot: known.repoRoot,
        branch: sourceControl.status?.branch ?? null,
      });
      return;
    }
    if (!sourceControlContextPath) return;
    try {
      const repo = await native.gitResolveRepo(sourceControlContextPath);
      if (!repo) return;
      openCommitHistoryTab({ repoRoot: repo.repoRoot, branch: repo.branch });
    } catch {
      /* noop */
    }
  }, [
    openCommitHistoryTab,
    sourceControl.hasRepo,
    sourceControl.repo,
    sourceControl.status?.branch,
    sourceControlContextPath,
  ]);

  const openPreviewTab = useCallback(
    (url: string) => {
      const id = newPreviewTab(url);
      // Focus the address bar if the URL is empty so the user can type.
      if (!url) {
        setTimeout(() => previewRefs.current.get(id)?.focusAddressBar(), 0);
      }
      return id;
    },
    [newPreviewTab],
  );

  const openMarkdownPreview = useCallback(
    (path: string) => {
      newMarkdownTab(path);
    },
    [newMarkdownTab],
  );

  const splitActivePaneInActiveTab = useCallback(
    (dir: "row" | "col") => {
      const t = tabsRef.current.find((x) => x.id === activeId);
      if (!t || t.kind !== "terminal") return;
      splitActivePane(activeId, dir);
    },
    [activeId, splitActivePane],
  );

  const handleCloseTabOrPane = useCallback(() => {
    const t = tabsRef.current.find((x) => x.id === activeId);
    if (t?.kind === "terminal" && leafIds(t.paneTree).length > 1) {
      closeActivePane(activeId);
      return;
    }
    handleClose(activeId);
  }, [activeId, closeActivePane, handleClose]);

  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [splitTabId, setSplitTabId] = useState<number | null>(null);

  const openSplitView = useCallback((tabId: number) => {
    setSplitTabId(tabId);
  }, []);

  const closeSplitView = useCallback(() => {
    setSplitTabId(null);
  }, []);

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "tab.new": openNewTab,
      "tab.newPreview": () => openPreviewTab(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": handleCloseTabOrPane,
      "tab.next": () => cycleTab(1),
      "tab.prev": () => cycleTab(-1),
      "tab.selectByIndex": (e) => selectByIndex(parseInt(e.key, 10) - 1),
      "pane.splitRight": () => splitActivePaneInActiveTab("row"),
      "pane.splitDown": () => splitActivePaneInActiveTab("col"),
      "pane.focusNext": () => focusNextPaneInTab(activeId, 1),
      "pane.focusPrev": () => focusNextPaneInTab(activeId, -1),
      "pane.source": toggleSourceControl,
      "search.focus": () => searchInlineRef.current?.focus(),
      "shortcuts.open": () => openSettingsTab("shortcuts"),
      "settings.open": () => openSettingsTab("general"),
      "terminal.clear": () => {
        if (activeLeafId !== null) terminalRefs.current.get(activeLeafId)?.clear();
      },
      "file.quickOpen": () => setQuickOpenVisible(true),
      "sidebar.toggle": toggleSidebar,
      "explorer.focus": toggleExplorerFocus,
      "view.zoomIn": zoomIn,
      "view.zoomOut": zoomOut,
      "view.zoomReset": zoomReset,
      "editor.undo": () => editorRefs.current.get(activeId)?.undo(),
      "editor.redo": () => editorRefs.current.get(activeId)?.redo(),
    }),
    [
      activeId,
      activeLeafId,
      cycleTab,
      handleCloseTabOrPane,
      openNewTab,
      openPreviewTab,
      openSettingsTab,
      selectByIndex,
      splitActivePaneInActiveTab,
      focusNextPaneInTab,
      toggleSourceControl,
      toggleSidebar,
      toggleExplorerFocus,
      zoomIn,
      zoomOut,
      zoomReset,
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId) => {
      if (id === "editor.undo" || id === "editor.redo") {
        return activeTab?.kind !== "editor";
      }
      if (id === "terminal.clear") {
        return activeTab?.kind !== "terminal";
      }
      return false;
    },
    [activeTab],
  );

  useGlobalShortcuts(shortcutHandlers, { isDisabled: shortcutsDisabled });

  const registerTerminalHandle = useCallback(
    (leafId: number, h: TerminalPaneHandle | null) => {
      if (h) terminalRefs.current.set(leafId, h);
      else terminalRefs.current.delete(leafId);
    },
    [],
  );

  const registerEditorHandle = useCallback(
    (id: number, h: EditorPaneHandle | null) => {
      if (h) editorRefs.current.set(id, h);
      else editorRefs.current.delete(id);
      if (id === activeId) setActiveEditorHandle(h);
    },
    [activeId],
  );

  const registerPreviewHandle = useCallback(
    (id: number, h: PreviewPaneHandle | null) => {
      if (h) previewRefs.current.set(id, h);
      else previewRefs.current.delete(id);
    },
    [],
  );

  const handlePreviewUrl = useCallback(
    (id: number, url: string) => updateTab(id, { url }),
    [updateTab],
  );

  const handleTerminalCwd = useCallback(
    (leafId: number, cwd: string) => setLeafCwd(leafId, cwd),
    [setLeafCwd],
  );

  const handleFocusLeaf = useCallback(
    (tabId: number, leafId: number) => focusPane(tabId, leafId),
    [focusPane],
  );

  const handleLeafExit = useCallback(
    (leafId: number, _code: number) => {
      const all = tabsRef.current;
      const tab = all.find(
        (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
      );
      if (!tab || tab.kind !== "terminal") return;
      const isLast =
        leafIds(tab.paneTree).length === 1 &&
        all.filter((t) => t.kind === "terminal").length === 1;
      if (isLast) {
        void respawnSession(leafId, tab.cwd);
      } else {
        closePaneByLeaf(leafId);
      }
    },
    [closePaneByLeaf],
  );

  const handleEditorDirty = useCallback(
    (id: number, dirty: boolean) => updateTab(id, { dirty }),
    [updateTab],
  );

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalTab && activeLeafId !== null && activeSearchAddon)
      return {
        kind: "terminal",
        addon: activeSearchAddon,
        focus: () => terminalRefs.current.get(activeLeafId)?.focus(),
      };
    if (isEditorTab && activeEditorHandle)
      return {
        kind: "editor",
        handle: activeEditorHandle,
        focus: () => activeEditorHandle.focus(),
      };
    if (isGitHistoryTab && gitHistoryHandle)
      return {
        kind: "git-history",
        handle: gitHistoryHandle,
        focus: () => {},
      };
    return null;
  }, [
    isTerminalTab,
    isEditorTab,
    isGitHistoryTab,
    activeLeafId,
    activeSearchAddon,
    activeEditorHandle,
    gitHistoryHandle,
  ]);

  const activeCwd = activeTerminalLeafCwd;

  const splitTab = splitTabId !== null ? tabs.find((t) => t.id === splitTabId) ?? null : null;

  const buildSecondarySurface = (secTab: NonNullable<typeof splitTab>) => {
    const isSecEditor = secTab.kind === "editor";
    const isSecPreview = secTab.kind === "preview";
    const isSecMarkdown = secTab.kind === "markdown";
    const isSecMedia = secTab.kind === "media";
    const isSecSession = secTab.kind === "session";
    const isSecGitDiff = secTab.kind === "git-diff" || secTab.kind === "git-commit-file";
    const isSecGitHistory = secTab.kind === "git-history";
    const isSecSettings = secTab.kind === "settings";
    return (
      <div className="relative h-full min-h-0">
        <div className={cn("absolute inset-0 px-3 pt-2 pb-2", !isSecEditor && "invisible pointer-events-none")} aria-hidden={!isSecEditor}>
          <EditorStack tabs={tabs} activeId={secTab.id} registerHandle={() => {}} onDirtyChange={() => {}} onCloseTab={() => {}} />
        </div>
        <div className={cn("absolute inset-0 px-3 pt-2 pb-2", !isSecPreview && "invisible pointer-events-none")} aria-hidden={!isSecPreview}>
          <PreviewStack tabs={tabs} activeId={secTab.id} registerHandle={() => {}} onUrlChange={() => {}} />
        </div>
        <div className={cn("absolute inset-0 px-3 pt-2 pb-2", !isSecMarkdown && "invisible pointer-events-none")} aria-hidden={!isSecMarkdown}>
          <MarkdownStack tabs={tabs} activeId={secTab.id} />
        </div>
        <div className={cn("absolute inset-0 px-3 pt-2 pb-2", !isSecMedia && "invisible pointer-events-none")} aria-hidden={!isSecMedia}>
          <MediaStack tabs={tabs} activeId={secTab.id} />
        </div>
        <div className={cn("absolute inset-0 px-3 pt-2 pb-2", !isSecSession && "invisible pointer-events-none")} aria-hidden={!isSecSession}>
          <SessionHistoryStack tabs={tabs} activeId={secTab.id} />
        </div>
        <div className={cn("absolute inset-0 px-3 pt-2 pb-2", !isSecGitDiff && "invisible pointer-events-none")} aria-hidden={!isSecGitDiff}>
          <GitDiffStack tabs={tabs} activeId={secTab.id} />
        </div>
        <div className={cn("absolute inset-0", !isSecGitHistory && "invisible pointer-events-none")} aria-hidden={!isSecGitHistory}>
          <GitHistoryStack tabs={tabs} activeId={secTab.id} onOpenCommitFile={openCommitFileDiffTab} onSearchHandle={() => {}} />
        </div>
        <div className={cn("absolute inset-0", !isSecSettings && "invisible pointer-events-none")} aria-hidden={!isSecSettings}>
          {isSecSettings && secTab.kind === "settings" ? (
            <SettingsPanel embedded activeTab={secTab.settingsTab} onActiveTabChange={() => {}} />
          ) : null}
        </div>
        {secTab.kind === "terminal" && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Terminal split is not supported — use pane split (⌘D) instead.
          </div>
        )}
      </div>
    );
  };

  const workspaceSurface = (
    <div className="relative h-full min-h-0">
      <div
        className={cn(
          "absolute inset-0 p-2",
          !isTerminalTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isTerminalTab}
      >
        <TerminalStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerTerminalHandle}
          onSearchReady={handleSearchReady}
          onCwd={handleTerminalCwd}
          onExit={handleLeafExit}
          onFocusLeaf={handleFocusLeaf}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isEditorTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isEditorTab}
      >
        <EditorStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerEditorHandle}
          onDirtyChange={handleEditorDirty}
          onCloseTab={disposeTab}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isPreviewTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isPreviewTab}
      >
        <PreviewStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerPreviewHandle}
          onUrlChange={handlePreviewUrl}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isMarkdownTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isMarkdownTab}
      >
        <MarkdownStack tabs={tabs} activeId={activeId} />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isMediaTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isMediaTab}
      >
        <MediaStack tabs={tabs} activeId={activeId} />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isSessionTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isSessionTab}
      >
        <SessionHistoryStack tabs={tabs} activeId={activeId} />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isGitDiffTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isGitDiffTab}
      >
        <GitDiffStack tabs={tabs} activeId={activeId} />
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isGitHistoryTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isGitHistoryTab}
      >
        <GitHistoryStack
          tabs={tabs}
          activeId={activeId}
          onOpenCommitFile={openCommitFileDiffTab}
          onSearchHandle={setGitHistoryHandle}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isSettingsTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isSettingsTab}
      >
        {activeSettingsTab ? (
          <SettingsPanel
            embedded
            activeTab={activeSettingsTab.settingsTab}
            onActiveTabChange={(settingsTab) =>
              updateTab(activeSettingsTab.id, {
                title: settingsTabTitle(settingsTab),
                settingsTab,
              })
            }
          />
        ) : null}
      </div>
    </div>
  );

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <Header
            tabs={tabs}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={openNewTab}
            onNewPreview={() => openPreviewTab("")}
            onNewEditor={() => setNewEditorOpen(true)}
            onNewGitGraph={openGitGraphFromContext}
            onClose={handleClose}
            onRenameTab={handleRenameTab}
            onPin={pinTab}
            onReorderTab={reorderTab}
            onOpenInSplit={openSplitView}
            onToggleSidebar={toggleSidebar}
            onToggleSourceControl={toggleSourceControl}
            onSplit={splitActivePaneInActiveTab}
            canSplit={
              activeTerminalTab !== null &&
              leafIds(activeTerminalTab.paneTree).length < MAX_PANES_PER_TAB
            }
            onOpenSettings={() => openSettingsTab("general")}
            sourceControlAvailable={sourceControl.hasRepo}
            sourceControlOpen={showGitContext}
            branchLabel={branchLabel}
            branchTitle={branchTitle}
            searchTarget={searchTarget}
            searchRef={searchInlineRef}
            cwd={activeCwd}
            filePath={activeFilePath}
            home={home}
            onCd={sendCd}
            onWorkspaceChange={switchWorkspace}
          />

          <main className="zoom-content flex min-h-0 flex-1 flex-col bg-background p-1.5">
            <ResizablePanelGroup
              id="workspace-layout"
              orientation="horizontal"
              className="min-h-0 flex-1"
              resizeTargetMinimumSize={{ fine: 24, coarse: 36 }}
            >
              <ResizablePanel
                id="sidebar"
                panelRef={sidebarRef}
                defaultSize={`${sidebarWidthRef.current}px`}
                minSize={`${SIDEBAR_MIN_WIDTH}px`}
                maxSize={`${SIDEBAR_MAX_WIDTH}px`}
                collapsible
                collapsedSize={0}
                onResize={(size) => {
                  if (size.inPixels > 0) persistSidebarWidth(size.inPixels);
                }}
              >
                <div className="flex h-full min-h-0 flex-col border border-sidebar-border bg-sidebar text-sidebar-foreground">
                  <div className="min-h-0 flex-1">
                    {sidebarView === "sessions" ? (
                      <SessionSidebar
                        contextPath={sourceControlContextPath}
                        repoRoot={sourceControl.repo?.repoRoot ?? null}
                        onOpenSession={handleOpenSession}
                      />
                    ) : (
                      <FileExplorer
                        ref={explorerRef}
                        rootPath={explorerRoot}
                        onOpenFile={handleOpenFile}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={cdInNewTab}
                        onOpenMarkdownPreview={openMarkdownPreview}
                      />
                    )}
                  </div>
                  <SidebarRail
                    activeView={sidebarView}
                    onSelectView={cycleSidebarView}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="workspace"
                defaultSize="78%"
                minSize="30%"
              >
                <div className="flex h-full min-h-0 flex-col border-y border-border/60 bg-card/35">
                  {splitTab ? (
                    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
                      <ResizablePanel id="workspace-primary" defaultSize="50%" minSize="20%">
                        <div className="relative h-full min-h-0">
                          {workspaceSurface}
                        </div>
                      </ResizablePanel>
                      <ResizableHandle withHandle />
                      <ResizablePanel id="workspace-secondary" defaultSize="50%" minSize="20%">
                        <div className="flex h-full min-h-0 flex-col">
                          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/50 bg-card/60 px-3">
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground/80">{splitTab.title}</span>
                            <button
                              type="button"
                              onClick={closeSplitView}
                              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              aria-label="Close split view"
                            >
                              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>
                            </button>
                          </div>
                          <div className="relative min-h-0 flex-1">
                            {buildSecondarySurface(splitTab)}
                          </div>
                        </div>
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  ) : (
                    <div className="relative min-h-0 flex-1">
                      {workspaceSurface}
                    </div>
                  )}
                </div>
              </ResizablePanel>
              {sourceControl.hasRepo ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    id="git-context"
                    panelRef={gitContextRef}
                    collapsible
                    collapsedSize={0}
                    defaultSize={`${gitContextWidthRef.current}px`}
                    minSize={`${GIT_CONTEXT_MIN_WIDTH}px`}
                    maxSize={`${GIT_CONTEXT_MAX_WIDTH}px`}
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={(size) => {
                      if (size.inPixels > 0) {
                        persistGitContextWidth(size.inPixels);
                      }
                    }}
                  >
                    <SourceControlPanel
                      open={showGitContext}
                      sourceControl={sourceControl}
                      onOpenDiff={openGitDiffTab}
                      onOpenGitGraph={openGitGraphFromContext}
                    />
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
          </main>

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileTab(path)}
          />

          <UpdaterDialog />

          <QuickOpen
            open={quickOpenVisible}
            onOpenChange={setQuickOpenVisible}
            rootPath={explorerRoot ?? home}
            onOpenFile={handleOpenFile}
          />

          <AlertDialog
            open={pendingCloseTab !== null}
            onOpenChange={(open) => !open && cancelClose()}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
                <AlertDialogDescription>
                  {tabs.find((t) => t.id === pendingCloseTab)?.title
                    ? `"${
                        tabs.find((t) => t.id === pendingCloseTab)?.title
                      }" has unsaved changes. Close anyway?`
                    : "This file has unsaved changes. Close anyway?"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelClose}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmClose}>
                  Close Anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={pendingDeleteTabs !== null}
            onOpenChange={(open) => !open && cancelDeleteClose()}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingDeleteTabs?.length === 1
                    ? (() => {
                        const title = tabs.find(
                          (t) => t.id === pendingDeleteTabs[0],
                        )?.title;
                        return title
                          ? `"${title}" has unsaved changes. The file has been deleted. Close anyway?`
                          : "This file has unsaved changes. The file has been deleted. Close anyway?";
                      })()
                    : `${pendingDeleteTabs?.length ?? 0} files have unsaved changes. They have been deleted. Close all anyway?`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelDeleteClose}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteClose}>
                  Close Anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  return shell;
}
