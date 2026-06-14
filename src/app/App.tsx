import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { native } from "@/lib/native";
import {
  NewEditorDialog,
  type EditorPaneHandle,
} from "@/modules/editor";
import type { GitHistorySearchHandle } from "@/modules/git-history";
import { getLaunchDir } from "@/lib/launchDir";
import { useZoom } from "@/lib/useZoom";
import { FileExplorer, type FileExplorerHandle } from "@/modules/explorer";
import { SearchPanel, type SearchPanelHandle } from "@/modules/search";
import { UnifiedPalette } from "@/modules/command-palette/UnifiedPaletteLazy";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import { type PreviewPaneHandle } from "@/modules/preview";
import { listenSettingsTabRequests } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setSessionsMcpEnabled as applySessionsMcpEnabled } from "@/modules/sessions/api";
import { SessionSidebar } from "@/modules/sessions";
import {
  loadInstalledExtensions,
  useExtensionBackgrounds,
} from "@/modules/extensions";
import { WorkspaceContext } from "@/modules/extensions/WorkspaceContext";
import { SidebarRail } from "@/modules/sidebar";
import {
  SourceControlPanel,
  useSourceControl,
} from "@/modules/source-control";
import {
  useTabs,
  useWorkspaceCwd,
} from "@/modules/tabs";
import {
  disposeSession,
  findLeafCwd,
  hasLeaf,
  leafIds,
  respawnSession,
  type TerminalPaneHandle,
} from "@/modules/terminal";
import { useExtensionSecondarySidebarPanels } from "@/modules/extensions/registry";
import { ThemeProvider } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { SearchAddon } from "@xterm/addon-search";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExtensionsSection } from "@/settings/sections/ExtensionsSection";
import {
  closeSecondarySidebar,
  createSecondarySidebarState,
  getVisibleSecondarySidebarView,
  sanitizeSecondarySidebarState,
  toggleGitContextPanel,
  toggleSecondarySidebarPanel,
  type SecondarySidebarState,
} from "./secondarySidebarState";
import {
  readSecondarySidebarView,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_VIEW_STORAGE_KEY,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "./layoutPersistence";
import { dirname, mediaKindForPath } from "./lib/media";
import { CloseConfirmDialogs } from "./CloseConfirmDialogs";
import { ExtensionBackground } from "./ExtensionBackground";
import { ExtensionSidebarPanel } from "./ExtensionSidebarPanel";
import { SecondarySidebarHeader } from "./SecondarySidebarHeader";
import { SplitPanels } from "./SplitPanels";
import { useAppShortcuts } from "./useAppShortcuts";
import { useSidebarLayout } from "./useSidebarLayout";
import { useSplitView } from "./useSplitView";
import { useTabClosing } from "./useTabClosing";
import { useWorkspaceBootstrap } from "./useWorkspaceBootstrap";
import { WorkspaceSurface } from "./WorkspaceSurface";

const SettingsPanel = lazy(() =>
  import("@/settings/SettingsApp").then((m) => ({ default: m.SettingsPanel })),
);

export default function App() {
  const {
    tabs,
    activeId,
    setActiveId,
    newTab,
    openFileTab,
    openMediaTab,
    openSessionTab,
    openExtensionTab,
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
  const searchPanelRef = useRef<SearchPanelHandle>(null);

  const {
    sidebarRef,
    secondarySidebarRef,
    sidebarWidthRef,
    secondarySidebarWidthRef,
    sidebarView,
    sidebarPosition,
    swapSidebarPosition,
    persistSidebarView,
    toggleSidebar,
    cycleSidebarView,
    persistSidebarWidth,
    persistSecondarySidebarWidth,
    toggleExplorerFocus,
  } = useSidebarLayout({ explorerRef });
  const [secondarySidebarState, setSecondarySidebarState] = useState<SecondarySidebarState>(() =>
    createSecondarySidebarState(readSecondarySidebarView()),
  );
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsDialogTab, setSettingsDialogTab] = useState<string>("general");
  const openSidebarSettings = useCallback((tab: string = "general") => {
    setSettingsDialogTab(tab);
    setSettingsDialogOpen(true);
  }, []);
  const toggleSidebarSettings = useCallback(() => {
    setSettingsDialogOpen((prev) => !prev);
  }, []);
  const closeSidebarSettings = useCallback(() => {
    setSettingsDialogOpen(false);
  }, []);

  const [zenMode, setZenMode] = useState(false);

  const handleBeforeWorkspaceSwitch = useCallback(() => {
    for (const id of liveLeavesRef.current) disposeSession(id);
    searchAddons.current.clear();
    terminalRefs.current.clear();
    editorRefs.current.clear();
    previewRefs.current.clear();
    setActiveSearchAddon(null);
    setActiveEditorHandle(null);
  }, []);

  const { home, launchCwd, launchCwdResolved, switchWorkspace } =
    useWorkspaceBootstrap({
      tabsRef,
      resetWorkspace,
      onBeforeSwitch: handleBeforeWorkspaceSwitch,
    });

  // Load community extensions once on startup (non-blocking; failures are isolated).
  useEffect(() => { void loadInstalledExtensions(); }, []);

  const extensionBackgrounds = useExtensionBackgrounds();

  // Handle extension tab open requests.
  useEffect(() => {
    const handler = (e: Event) => {
      const { kind, title, data } = (e as CustomEvent<{ kind: string; title: string; data?: unknown }>).detail;
      openExtensionTab(kind, title, data);
    };
    window.addEventListener("recall:open-extension-tab", handler);
    return () => window.removeEventListener("recall:open-extension-tab", handler);
  }, [openExtensionTab]);

  // Handle terminal text insertion from extensions (e.g. NL shell overlay).
  const activeLeafIdRef = useRef<number | null>(null);
  useEffect(() => { activeLeafIdRef.current = activeLeafId; }, [activeLeafId]);
  useEffect(() => {
    const handler = (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string }>).detail;
      const leafId = activeLeafIdRef.current;
      if (leafId !== null) {
        terminalRefs.current.get(leafId)?.write(text);
        terminalRefs.current.get(leafId)?.focus();
      }
    };
    window.addEventListener("recall:terminal:insert-text", handler);
    return () => window.removeEventListener("recall:terminal:insert-text", handler);
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

  useEffect(() => listenSettingsTabRequests(openSidebarSettings), [openSidebarSettings]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const isTerminalTab = activeTab?.kind === "terminal";
  const isEditorTab = activeTab?.kind === "editor";
  const isGitHistoryTab = activeTab?.kind === "git-history";

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

  const {
    pendingCloseTab,
    pendingDeleteTabs,
    pendingRunningTab,
    handleClose,
    confirmClose,
    cancelClose,
    confirmRunningClose,
    cancelRunningClose,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
  } = useTabClosing({ tabs, disposeTab });

  const handleRenameTab = useCallback(
    (id: number, title: string) => updateTab(id, { title }),
    [updateTab],
  );

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

  const handleOpenSearchMatch = useCallback(
    (path: string, line: number) => {
      const id = openFileTab(path, false);
      if (id === null) return;
      // The editor mounts (and loads its document) asynchronously; retry
      // revealLine until the CodeMirror view exists.
      let attempts = 0;
      const tryReveal = () => {
        const handle = editorRefs.current.get(id);
        if (handle?.revealLine(line)) return;
        if (++attempts < 40) window.setTimeout(tryReveal, 50);
      };
      tryReveal();
    },
    [openFileTab],
  );

  const openProjectSearch = useCallback(() => {
    const panel = sidebarRef.current;
    if (panel && panel.getSize().asPercentage <= 0) {
      panel.resize(`${sidebarWidthRef.current}px`);
    }
    if (sidebarView !== "search") persistSidebarView("search");
    searchPanelRef.current?.focus();
    // The panel may not be mounted yet when switching views.
    requestAnimationFrame(() => searchPanelRef.current?.focus());
  }, [persistSidebarView, sidebarRef, sidebarView, sidebarWidthRef]);

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

  const activeTerminalLeafCwd =
    activeTab?.kind === "terminal"
      ? (findLeafCwd(activeTab.paneTree, activeTab.activeLeafId) ??
        activeTab.cwd ??
        null)
      : null;

  useEffect(() => {
    const cwd = activeTerminalLeafCwd;
    const parts = cwd ? cwd.replace(/\\/g, "/").split("/").filter(Boolean) : [];
    const folder = parts[parts.length - 1] ?? "Recall";
    const title = folder === "Recall" ? "Recall" : `${folder} — Recall`;
    void getCurrentWebviewWindow().setTitle(title);
  }, [activeTerminalLeafCwd]);

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
  const secondarySidebarView = getVisibleSecondarySidebarView(
    secondarySidebarState,
    sourceControl.hasRepo,
  );
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
  const stagedChangeCount = sourceControl.status?.changedFiles.filter(
    (file) => file.staged,
  ).length ?? 0;
  const changedFileCount = sourceControl.status?.changedFiles.length ?? 0;

  const toggleSourceControl = useCallback(() => {
    if (!sourceControl.hasRepo) return;
    setSecondarySidebarState((prev) =>
      toggleGitContextPanel(prev, sourceControl.hasRepo),
    );
  }, [sourceControl.hasRepo]);

  const secondaryExtPanels = useExtensionSecondarySidebarPanels();

  const secondarySidebarOpen = secondarySidebarView !== "closed";

  useEffect(() => {
    setSecondarySidebarState((prev) =>
      sanitizeSecondarySidebarState(prev, sourceControl.hasRepo),
    );
  }, [sourceControl.hasRepo]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RIGHT_PANEL_VIEW_STORAGE_KEY, secondarySidebarView);
    } catch {
      // ignore
    }
  }, [secondarySidebarView]);

  useEffect(() => {
    let retryFrame = 0;
    const applyPanelState = (allowRetry: boolean) => {
      const panel = secondarySidebarRef.current;
      if (!panel) return;
      try {
        if (secondarySidebarOpen) panel.resize(`${secondarySidebarWidthRef.current}px`);
        else panel.collapse();
       } catch (error) {
        if (
          allowRetry &&
          error instanceof Error &&
          error.message.includes("Layout not found for Panel right-panel")
         ) {
          retryFrame = window.requestAnimationFrame(() => applyPanelState(false));
          return;
         }
        console.warn("secondary sidebar resize skipped:", error);
       }
     };

    const frame = window.requestAnimationFrame(() => applyPanelState(true));
    return () => {
      window.cancelAnimationFrame(frame);
      if (retryFrame) window.cancelAnimationFrame(retryFrame);
     };
   }, [secondarySidebarOpen, secondarySidebarView, sidebarPosition]);


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

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteInitialQuery, setPaletteInitialQuery] = useState("");

  const {
    rowSplitTabIds,
    colSplitTabIds,
    splitDragZone,
    setSplitDragZone,
    workspacePanelRef,
    openSplitView,
    removeSplitTab,
    handleDragToSplit,
    getWorkspaceRect,
    unsplitDraggingTabId,
    unsplitDragPos,
    unsplitOverHeader,
    handleUnsplitPointerDown,
    handleUnsplitPointerMove,
    handleUnsplitPointerUp,
    draggingTab,
    hasSplit,
    primaryTabs,
  } = useSplitView({ tabs, tabsRef, setActiveId });

  const shortcutHandlers = useAppShortcuts({
    activeId,
    activeLeafId,
    activeTab,
    activeTerminalLeafCwd,
    terminalRefs,
    editorRefs,
    searchInlineRef,
    openNewTab,
    openPreviewTab,
    setNewEditorOpen,
    handleCloseTabOrPane,
    cycleTab,
    selectByIndex,
    splitActivePaneInActiveTab,
    focusNextPaneInTab,
    toggleSourceControl,
    openSidebarSettings,
    setPaletteInitialQuery,
    setPaletteOpen,
    toggleSidebar,
    cycleSidebarView,
    swapSidebarPosition,
    toggleExplorerFocus,
    openProjectSearch,
    zoomIn,
    zoomOut,
    zoomReset,
    setZenMode,
  });

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

  const handleCloseOthers = useCallback(
    (keepId: number) => {
      for (const t of primaryTabs) {
        if (t.id === keepId) continue;
        if (t.kind === "editor" && t.dirty) continue;
        disposeTab(t.id);
      }
    },
    [primaryTabs, disposeTab],
  );

  const handleCloseToRight = useCallback(
    (id: number) => {
      const idx = primaryTabs.findIndex((t) => t.id === id);
      if (idx < 0) return;
      for (const t of primaryTabs.slice(idx + 1)) {
        if (t.kind === "editor" && t.dirty) continue;
        disposeTab(t.id);
      }
    },
    [primaryTabs, disposeTab],
  );

  const handleSelectSecondaryTab = useCallback((id: string) => {
    setSecondarySidebarState((prev) =>
      id === prev.view ? closeSecondarySidebar(prev) : { view: id },
    );
  }, []);

  const workspaceSurface = (
    <WorkspaceSurface
      tabs={tabs}
      primaryTabs={primaryTabs}
      activeId={activeId}
      activeTab={activeTab}
      registerTerminalHandle={registerTerminalHandle}
      onSearchReady={handleSearchReady}
      onTerminalCwd={handleTerminalCwd}
      onLeafExit={handleLeafExit}
      onFocusLeaf={handleFocusLeaf}
      registerEditorHandle={registerEditorHandle}
      onEditorDirty={handleEditorDirty}
      onCloseTab={disposeTab}
      registerPreviewHandle={registerPreviewHandle}
      onPreviewUrl={handlePreviewUrl}
      onOpenCommitFile={openCommitFileDiffTab}
      onGitHistorySearchHandle={setGitHistoryHandle}
    />
  );

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          {!zenMode && <Header
            tabs={primaryTabs}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={openNewTab}
            onNewPreview={() => openPreviewTab("")}
            onNewEditor={() => setNewEditorOpen(true)}
            onClose={handleClose}
            onRenameTab={handleRenameTab}
            onPin={pinTab}
            onReorderTab={(fromPrimaryIdx, dropPrimaryPos) => {
              // Map primary-tabs indices to full-tabs indices.
              const fromTab = primaryTabs[fromPrimaryIdx];
              if (!fromTab) return;
              const fromFull = tabs.findIndex((t) => t.id === fromTab.id);
              let dropFull: number;
              if (dropPrimaryPos >= primaryTabs.length) {
                const last = primaryTabs[primaryTabs.length - 1];
                dropFull = last ? tabs.findIndex((t) => t.id === last.id) + 1 : tabs.length;
              } else {
                const dropTab = primaryTabs[dropPrimaryPos];
                dropFull = tabs.findIndex((t) => t.id === dropTab.id);
              }
              reorderTab(fromFull, dropFull);
            }}
            onOpenInSplit={openSplitView}
            onCloseOthers={handleCloseOthers}
            onCloseToRight={handleCloseToRight}
            onDragToSplit={handleDragToSplit}
            onSplitZoneChange={setSplitDragZone}
            getWorkspaceRect={getWorkspaceRect}
            onToggleSidebar={toggleSidebar}
            searchTarget={searchTarget}
            searchRef={searchInlineRef}
            onWorkspaceChange={switchWorkspace}
            onOpenMarkdownPreview={openMarkdownPreview}
            unsplitDropActive={unsplitOverHeader}
          />}

          <main className="zoom-content flex min-h-0 flex-1 flex-col bg-background">
            {(() => {
              const sidebarPanelContent = (
                <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {sidebarView === "sessions" ? (
                      <SessionSidebar
                        contextPath={sourceControlContextPath}
                        repoRoot={sourceControl.repo?.repoRoot ?? null}
                        onOpenSession={handleOpenSession}
                      />
                    ) : sidebarView === "explorer" ? (
                      <FileExplorer
                        ref={explorerRef}
                        rootPath={explorerRoot}
                        onOpenFile={handleOpenFile}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={cdInNewTab}
                        onOpenMarkdownPreview={openMarkdownPreview}
                      />
                    ) : sidebarView === "search" ? (
                      <SearchPanel
                        ref={searchPanelRef}
                        rootPath={explorerRoot}
                        onOpenMatch={handleOpenSearchMatch}
                      />
                    ) : sidebarView === "extensions" ? (
                      <div className="flex h-full flex-col overflow-hidden">
                        <ExtensionsSection />
                      </div>
                    ) : (
                      <ExtensionSidebarPanel viewId={sidebarView} workspacePath={activeTerminalLeafCwd ?? explorerRoot ?? null} />
                    )}
                  </div>
                </div>
              );
              const sidebarPanel = (
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
                  {sidebarPanelContent}
                </ResizablePanel>
              );
              const secondaryPanel = (
                <ResizablePanel
                 id="right-panel"
                 panelRef={secondarySidebarRef}
                 defaultSize={`${secondarySidebarWidthRef.current}px`}
                 minSize={`${RIGHT_PANEL_MIN_WIDTH}px`}
                 maxSize={`${RIGHT_PANEL_MAX_WIDTH}px`}
                 groupResizeBehavior="preserve-pixel-size"
                 collapsible
                 collapsedSize={0}
                 onResize={(size) => {
                    if (size.inPixels > 0) persistSecondarySidebarWidth(size.inPixels);
                    else setSecondarySidebarState((prev) => closeSecondarySidebar(prev));
                 }}
                >
                 <div className="flex h-full flex-col bg-card/25">
                   <SecondarySidebarHeader
                     hasRepo={sourceControl.hasRepo}
                     extPanels={secondaryExtPanels}
                     activeView={secondarySidebarView}
                     onSelectTab={handleSelectSecondaryTab}
                   />
                   <div className="min-h-0 flex-1 overflow-hidden">
                     {sourceControl.hasRepo && secondarySidebarView === "git-context" && (
                       <SourceControlPanel
                         open
                         sourceControl={sourceControl}
                         onOpenDiff={openGitDiffTab}
                         onOpenGitGraph={openGitGraphFromContext}
                       />
                     )}
                     {secondaryExtPanels.map((p) =>
                       secondarySidebarView === p.id ? (
                         <WorkspaceContext.Provider
                           key={p.id}
                           value={{ workspacePath: activeTerminalLeafCwd ?? explorerRoot ?? null }}
                         >
                           {p.render()}
                         </WorkspaceContext.Provider>
                       ) : null,
                     )}
                   </div>
                  </div>
                </ResizablePanel>
              );
              return (
            <ResizablePanelGroup
              id="workspace-layout"
              orientation="horizontal"
              className="min-h-0 flex-1"
              resizeTargetMinimumSize={{ fine: 24, coarse: 36 }}
            >
              {sidebarPosition === "left" && sidebarPanel}
              {sidebarPosition === "left" && <ResizableHandle />}
              {sidebarPosition === "right" && secondaryPanel}
              {sidebarPosition === "right" && secondarySidebarOpen && <ResizableHandle />}
              <ResizablePanel
                id="workspace"
                defaultSize="78%"
                minSize="30%"
              >
                <div
                  ref={workspacePanelRef}
                  className="relative flex h-full min-h-0 flex-col bg-background"
                >
                  {hasSplit ? (
                    <SplitPanels
                      tabs={tabs}
                      rowSplitTabIds={rowSplitTabIds}
                      colSplitTabIds={colSplitTabIds}
                      unsplitDraggingTabId={unsplitDraggingTabId}
                      onUnsplitPointerDown={handleUnsplitPointerDown}
                      onUnsplitPointerMove={handleUnsplitPointerMove}
                      onUnsplitPointerUp={handleUnsplitPointerUp}
                      removeSplitTab={removeSplitTab}
                      registerTerminalHandle={registerTerminalHandle}
                      onSearchReady={handleSearchReady}
                      onTerminalCwd={handleTerminalCwd}
                      onLeafExit={handleLeafExit}
                      onFocusLeaf={handleFocusLeaf}
                      onOpenCommitFile={openCommitFileDiffTab}
                    >
                      {workspaceSurface}
                    </SplitPanels>
                  ) : (
                    <div className="relative min-h-0 flex-1">
                      {workspaceSurface}
                    </div>
                  )}
                  {splitDragZone !== null && (
                    <div className="pointer-events-none absolute inset-0 z-50">
                      {splitDragZone === "row" && (
                        <div className="absolute inset-y-0 right-0 w-[35%] rounded-l-lg border-2 border-dashed border-primary/60 bg-primary/10 m-1.5" />
                      )}
                      {splitDragZone === "col" && (
                        <div className="absolute inset-x-0 bottom-0 h-[55%] rounded-t-lg border-2 border-dashed border-primary/60 bg-primary/10 m-1.5" />
                      )}
                    </div>
                  )}
                </div>
              </ResizablePanel>
              {sidebarPosition === "left" && secondarySidebarOpen && <ResizableHandle />}
              {sidebarPosition === "left" && secondaryPanel}
              {sidebarPosition === "right" && <ResizableHandle />}
              {sidebarPosition === "right" && sidebarPanel}
             </ResizablePanelGroup>
              ); // end IIFE return
            })()} {/* end IIFE */}
           </main>

          {!zenMode && (
            <SidebarRail
              activeView={sidebarView}
              onSelectView={cycleSidebarView}
              settingsOpen={settingsDialogOpen}
              onToggleSettings={toggleSidebarSettings}
              cwd={activeTerminalLeafCwd}
              branchLabel={branchLabel}
              stagedCount={stagedChangeCount}
              changedCount={changedFileCount}
              onOpenSourceControl={sourceControl.hasRepo ? toggleSourceControl : undefined}
              sidebarPosition={sidebarPosition}
              secondaryPanels={secondaryExtPanels}
              secondaryView={secondarySidebarView}
              onSelectSecondaryPanel={(id) => {
                setSecondarySidebarState((prev) => toggleSecondarySidebarPanel(prev, id));
                const p = secondarySidebarRef.current;
                if (p) {
                  const isOpen = secondarySidebarView === id;
                  if (isOpen) p.collapse();
                  else if (p.getSize().asPercentage <= 0) p.expand();
                }
              }}
            />
          )}

           {draggingTab && unsplitDragPos
             ? createPortal(
                 <div
                   className={cn(
                     "pointer-events-none fixed z-[9999] flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-lg",
                     unsplitOverHeader
                       ? "border-2 border-primary bg-primary/15 text-foreground"
                       : "border border-border/80 bg-card text-foreground",
                   )}
                   style={{
                     left: unsplitDragPos.x + 14,
                     top: unsplitDragPos.y + 12,
                   }}
                 >
                   <span className="max-w-[8rem] truncate">{draggingTab.title}</span>
                   {unsplitOverHeader && (
                     <span className="shrink-0 text-primary opacity-80">
                       ↑ to tab bar
                     </span>
                   )}
                 </div>,
                 document.body,
               )
             : null}

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileTab(path)}
          />

          <UpdaterDialog />

          <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
            <DialogContent showCloseButton={false} className="gap-0 overflow-hidden rounded-xl border border-border/40 p-0 w-[960px] sm:max-w-[960px] h-[700px]">
              <DialogTitle className="sr-only">Settings</DialogTitle>
              <Suspense fallback={null}>
                <SettingsPanel
                  embedded
                  activeTab={settingsDialogTab}
                  onActiveTabChange={setSettingsDialogTab}
                  onClose={closeSidebarSettings}
                />
              </Suspense>
            </DialogContent>
          </Dialog>

          <UnifiedPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            rootPath={explorerRoot ?? home}
            onOpenFile={handleOpenFile}
            initialQuery={paletteInitialQuery}
            symbolSource={activeEditorHandle}
            onRunCommand={(id) => {
              const h = shortcutHandlers[id];
              if (h) h(new KeyboardEvent("keydown"));
            }}
          />

          <CloseConfirmDialogs
            tabs={tabs}
            pendingCloseTab={pendingCloseTab}
            confirmClose={confirmClose}
            cancelClose={cancelClose}
            pendingDeleteTabs={pendingDeleteTabs}
            confirmDeleteClose={confirmDeleteClose}
            cancelDeleteClose={cancelDeleteClose}
            pendingRunningTab={pendingRunningTab}
            confirmRunningClose={confirmRunningClose}
            cancelRunningClose={cancelRunningClose}
          />
        </div>
      </TooltipProvider>
      {/* Extension background components (portals, overlays, global listeners) */}
      {extensionBackgrounds.map((bg) => (
        <ExtensionBackground key={bg.id} render={bg.render} />
      ))}
    </ThemeProvider>
  );

  return shell;
}
