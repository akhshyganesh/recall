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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { FileExplorer, type FileExplorerHandle } from "@/modules/explorer";
import { UnifiedPalette } from "@/modules/command-palette/UnifiedPalette";
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
import { listenSettingsTabRequests } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setSessionsMcpEnabled as applySessionsMcpEnabled } from "@/modules/sessions/api";
import { SessionHistoryStack, SessionSidebar } from "@/modules/sessions";
import {
  useGlobalShortcuts,
  type ShortcutHandlers,
  type ShortcutId,
} from "@/modules/shortcuts";
import {
  loadInstalledExtensions,
  useExtensionRegistry,
  useExtensionBackgrounds,
} from "@/modules/extensions";
import { WorkspaceContext } from "@/modules/extensions/WorkspaceContext";
import { SidebarRail, type SidebarViewId } from "@/modules/sidebar";
import {
  SourceControlPanel,
  useSourceControl,
} from "@/modules/source-control";
import {
  useTabs,
  useWorkspaceCwd,
  type MediaKind,
  type Tab,
  type ExtensionTab,
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
import { findTabRenderer, useExtensionSecondarySidebarPanels } from "@/modules/extensions/registry";
import type { SidebarPanelDef } from "@/modules/extensions/types";
import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ThemeProvider } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import {
  getWslHome,
  LOCAL_WORKSPACE,
  useWorkspaceEnvStore,
  type WorkspaceEnv,
} from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { SearchAddon } from "@xterm/addon-search";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { SettingsPanel } from "@/settings/SettingsApp";
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

function SecondarySidebarHeader({
  hasRepo,
  extPanels,
  activeView,
  onSelectTab,
}: {
  hasRepo: boolean;
  extPanels: SidebarPanelDef[];
  activeView: string;
  onSelectTab: (id: string) => void;
}) {
  const tabs = [
    ...(hasRepo
      ? [
          {
            id: "git-context",
            label: "Source Control",
            icon: (
              <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={1.75} className="shrink-0" />
            ),
          },
        ]
      : []),
    ...extPanels.map((p) => ({ id: p.id, label: p.label, icon: p.icon })),
  ];
  if (tabs.length === 0) return null;
  return (
    <div className="flex shrink-0 items-stretch border-b border-border/40">
      {tabs.map((tab) => {
        const isActive = activeView === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground/60 hover:text-foreground",
            )}
          >
            {isActive && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
            )}
            <span className="flex shrink-0 items-center">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ExtensionBackground({ render }: { render: () => React.ReactNode }) {
  return <>{render()}</>;
}

function ExtensionSidebarPanel({ viewId, workspacePath }: { viewId: string; workspacePath: string | null }) {
  const panel = useExtensionRegistry((s) => s.sidebarPanels.find((p) => p.id === viewId));
  if (!panel) return null;
  return (
    <WorkspaceContext.Provider value={{ workspacePath }}>
      {panel.render()}
    </WorkspaceContext.Provider>
  );
}

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
// Single right panel used for both Settings and Source Control views.
const RIGHT_PANEL_DEFAULT_WIDTH = 380;
const RIGHT_PANEL_MIN_WIDTH = 240;
const RIGHT_PANEL_MAX_WIDTH = 600;
const RIGHT_PANEL_WIDTH_STORAGE_KEY = "recall.right-panel.width";
const SIDEBAR_POSITION_STORAGE_KEY = "recall.sidebar.position";

type SidebarPosition = "left" | "right";

function readSidebarPosition(): SidebarPosition {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_POSITION_STORAGE_KEY);
    if (stored === "left" || stored === "right") return stored;
  } catch {
    // ignore
  }
  return "left";
}

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
    if (
      stored === "sessions" ||
      stored === "explorer" ||
      stored === "extensions" ||
      // Allow any stored extension panel ID (namespaced as "<extId>:<panelId>")
      (stored && stored.includes(":"))
    )
      return stored;
  } catch {
    // ignore
  }
  return "explorer";
}

function clampSecondarySidebarWidth(width: number): number {
  return Math.min(
    RIGHT_PANEL_MAX_WIDTH,
    Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(width)),
   );
}

function readSecondarySidebarWidth(): number {
  try {
    const stored = window.localStorage.getItem(RIGHT_PANEL_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed)
       ? clampSecondarySidebarWidth(parsed)
       : RIGHT_PANEL_DEFAULT_WIDTH;
   } catch {
    return RIGHT_PANEL_DEFAULT_WIDTH;
   }
}

export type { SecondarySidebarViewId } from "./secondarySidebarState";

function readSecondarySidebarView(): string {
  try {
    const stored = window.localStorage.getItem("recall.right-panel.view");
    if (stored && stored !== "closed") return stored;
  } catch {
    // ignore
  }
  return "closed";
}

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
  const explorerReturnFocusRef = useRef<HTMLElement | null>(null);

  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const secondarySidebarRef = useRef<PanelImperativeHandle | null>(null);
  const sidebarWidthRef = useRef(readSidebarWidth());
  const secondarySidebarWidthRef = useRef(readSecondarySidebarWidth());
  const sidebarWidthWriteTimerRef = useRef(0);
  const secondarySidebarWidthWriteTimerRef = useRef(0);
  const [sidebarView, setSidebarViewState] = useState<SidebarViewId>(readSidebarView);
  const [secondarySidebarState, setSecondarySidebarState] = useState<SecondarySidebarState>(() =>
    createSecondarySidebarState(readSecondarySidebarView()),
  );
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsDialogTab, setSettingsDialogTab] = useState<string>("general");
  const [sidebarPosition, setSidebarPositionState] = useState<SidebarPosition>(readSidebarPosition);
  const swapSidebarPosition = useCallback(() => {
    setSidebarPositionState((prev) => {
      const next: SidebarPosition = prev === "left" ? "right" : "left";
      try { window.localStorage.setItem(SIDEBAR_POSITION_STORAGE_KEY, next); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = () => {
      try {
        const v = window.localStorage.getItem(SIDEBAR_POSITION_STORAGE_KEY);
        if (v === "left" || v === "right") setSidebarPositionState(v);
      } catch {}
    };
    window.addEventListener("recall:sidebar-position-changed", handler);
    return () => window.removeEventListener("recall:sidebar-position-changed", handler);
  }, []);

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
  const persistSecondarySidebarWidth = useCallback((next: number) => {
    secondarySidebarWidthRef.current = next;
    if (secondarySidebarWidthWriteTimerRef.current) {
      window.clearTimeout(secondarySidebarWidthWriteTimerRef.current);
     }
    secondarySidebarWidthWriteTimerRef.current = window.setTimeout(() => {
      secondarySidebarWidthWriteTimerRef.current = 0;
      try {
        window.localStorage.setItem(RIGHT_PANEL_WIDTH_STORAGE_KEY, String(next));
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
      if (secondarySidebarWidthWriteTimerRef.current) {
        window.clearTimeout(secondarySidebarWidthWriteTimerRef.current);
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
  const [zenMode, setZenMode] = useState(false);
  const [pendingRunningTab, setPendingRunningTab] = useState<number | null>(null);
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
  const isPreviewTab = activeTab?.kind === "preview";
  const isMarkdownTab = activeTab?.kind === "markdown";
  const isMediaTab = activeTab?.kind === "media";
  const isSessionTab = activeTab?.kind === "session";
  const isGitDiffTab =
    activeTab?.kind === "git-diff" || activeTab?.kind === "git-commit-file";
  const isGitHistoryTab = activeTab?.kind === "git-history";
  const isExtensionTab =
    !!activeTab &&
    !["terminal","editor","preview","markdown","media","session","git-diff","git-commit-file","git-history"].includes(activeTab.kind);

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
      if (t?.kind === "terminal") {
        const tabLeafIds = leafIds(t.paneTree);
        void (async () => {
          for (const leafId of tabLeafIds) {
            const hasChild = await invoke<boolean>("pty_has_child", { id: leafId }).catch(() => false);
            if (hasChild) {
              setPendingRunningTab(id);
              return;
            }
          }
          disposeTab(id);
        })();
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

  const confirmRunningClose = useCallback(() => {
    if (pendingRunningTab !== null) {
      disposeTab(pendingRunningTab);
      setPendingRunningTab(null);
    }
  }, [pendingRunningTab, disposeTab]);

  const cancelRunningClose = useCallback(() => {
    setPendingRunningTab(null);
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
      window.localStorage.setItem("recall.right-panel.view", secondarySidebarView);
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
   }, [secondarySidebarOpen, secondarySidebarView]);


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
  const [rowSplitTabIds, setRowSplitTabIds] = useState<number[]>([]);
  const [colSplitTabIds, setColSplitTabIds] = useState<number[]>([]);
  const [splitDragZone, setSplitDragZone] = useState<"row" | "col" | null>(null);
  const workspacePanelRef = useRef<HTMLDivElement>(null);
  // Refs so callbacks can read current split IDs without stale closures.
  const rowSplitTabIdsRef = useRef<number[]>([]);
  const colSplitTabIdsRef = useRef<number[]>([]);
  rowSplitTabIdsRef.current = rowSplitTabIds;
  colSplitTabIdsRef.current = colSplitTabIds;

  const openSplitView = useCallback((tabId: number, dir: "row" | "col" = "row") => {
    if (rowSplitTabIdsRef.current.includes(tabId) || colSplitTabIdsRef.current.includes(tabId)) return;
    if (dir === "row") {
      setRowSplitTabIds((prev) => [...prev, tabId]);
    } else {
      setColSplitTabIds((prev) => [...prev, tabId]);
    }
    setActiveId((prev) => {
      if (prev !== tabId) return prev;
      const allSplit = new Set([...rowSplitTabIdsRef.current, ...colSplitTabIdsRef.current, tabId]);
      const other = tabsRef.current.find((t) => !allSplit.has(t.id));
      return other?.id ?? prev;
    });
  }, []);

  const removeSplitTab = useCallback((tabId: number) => {
    setRowSplitTabIds((prev) => prev.filter((id) => id !== tabId));
    setColSplitTabIds((prev) => prev.filter((id) => id !== tabId));
  }, []);

  const handleDragToSplit = useCallback(
    (tabId: number, dir: "row" | "col") => openSplitView(tabId, dir),
    [openSplitView],
  );

  const getWorkspaceRect = useCallback(
    () => workspacePanelRef.current?.getBoundingClientRect() ?? null,
    [],
  );

  const [unsplitDraggingTabId, setUnsplitDraggingTabId] = useState<number | null>(null);
  const [unsplitDragPos, setUnsplitDragPos] = useState<{ x: number; y: number } | null>(null);
  const [unsplitOverHeader, setUnsplitOverHeader] = useState(false);
  const unsplitStartRef = useRef<{ x: number; y: number; tabId: number } | null>(null);

  const handleUnsplitPointerDown = useCallback((e: React.PointerEvent, tabId: number) => {
    e.stopPropagation();
    unsplitStartRef.current = { x: e.clientX, y: e.clientY, tabId };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }, []);

  const handleUnsplitPointerMove = useCallback((e: React.PointerEvent) => {
    const start = unsplitStartRef.current;
    if (!start) return;
    if (unsplitDraggingTabId === null) {
      if (Math.abs(e.clientX - start.x) <= 5 && Math.abs(e.clientY - start.y) <= 5) return;
      setUnsplitDraggingTabId(start.tabId);
      setUnsplitDragPos({ x: e.clientX, y: e.clientY });
      return;
    }
    setUnsplitDragPos({ x: e.clientX, y: e.clientY });
    const wsRect = workspacePanelRef.current?.getBoundingClientRect();
    setUnsplitOverHeader(!!wsRect && e.clientY < wsRect.top);
  }, [unsplitDraggingTabId]);

  const handleUnsplitPointerUp = useCallback((e: React.PointerEvent) => {
    const draggingId = unsplitDraggingTabId ?? unsplitStartRef.current?.tabId;
    if (draggingId !== null && draggingId !== undefined) {
      const wsRect = workspacePanelRef.current?.getBoundingClientRect();
      if (wsRect && e.clientY < wsRect.top) {
        removeSplitTab(draggingId);
        setActiveId(draggingId);
      }
    }
    unsplitStartRef.current = null;
    setUnsplitDraggingTabId(null);
    setUnsplitDragPos(null);
    setUnsplitOverHeader(false);
  }, [unsplitDraggingTabId, removeSplitTab]);
  const draggingTab = useMemo(
    () =>
      unsplitDraggingTabId === null
        ? null
        : tabs.find((tab) => tab.id === unsplitDraggingTabId) ?? null,
    [tabs, unsplitDraggingTabId],
  );

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
      "shortcuts.open": () => openSidebarSettings("shortcuts"),
      "settings.open": () => openSidebarSettings("general"),
      "terminal.clear": () => {
        if (activeLeafId !== null) terminalRefs.current.get(activeLeafId)?.clear();
      },
      "ai.nlCommand": () => {
        if (activeTab?.kind !== "terminal") return;
        window.dispatchEvent(
          new CustomEvent("recall:nl-command:trigger", {
            detail: { cwd: activeTerminalLeafCwd },
          }),
        );
      },
      "file.quickOpen": () => { setPaletteInitialQuery(""); setPaletteOpen(true); },
      "command.palette": () => { setPaletteInitialQuery(">"); setPaletteOpen(true); },
      "sidebar.toggle": toggleSidebar,
      "sidebar.sessions": () => cycleSidebarView("sessions"),
      "sidebar.files": () => cycleSidebarView("explorer"),
      "sidebar.extensions": () => cycleSidebarView("extensions"),
      "sidebar.git": toggleSourceControl,
      "sidebar.position.swap": swapSidebarPosition,
      "explorer.focus": toggleExplorerFocus,
      "view.zoomIn": zoomIn,
      "view.zoomOut": zoomOut,
      "view.zoomReset": zoomReset,
      "view.zen": () => setZenMode((z) => !z),
      "editor.undo": () => editorRefs.current.get(activeId)?.undo(),
      "editor.redo": () => editorRefs.current.get(activeId)?.redo(),
    }),
    [
      activeId,
      activeLeafId,
      activeTab,
      activeTerminalLeafCwd,
      cycleTab,
      handleCloseTabOrPane,
      openNewTab,
      openPreviewTab,
      openSidebarSettings,
      selectByIndex,
      splitActivePaneInActiveTab,
      focusNextPaneInTab,
      toggleSourceControl,
      toggleSidebar,
      swapSidebarPosition,
      cycleSidebarView,
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
      if (id === "ai.nlCommand") {
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

  const splitTabs = tabs.filter((t) => rowSplitTabIds.includes(t.id) || colSplitTabIds.includes(t.id));
  const hasSplit = splitTabs.length > 0;
  const primaryTabs = hasSplit ? tabs.filter((t) => !rowSplitTabIds.includes(t.id) && !colSplitTabIds.includes(t.id)) : tabs;

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

  const renderSplitPanel = (t: Tab) => (
    <div className="group/pane flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 select-none items-center gap-1 border-b border-border/40 bg-card/50 px-1.5">
        <div
          className={cn(
            "flex min-w-0 flex-1 cursor-grab items-center gap-1 active:cursor-grabbing",
            unsplitDraggingTabId === t.id && "opacity-40",
          )}
          onPointerDown={(e) => handleUnsplitPointerDown(e, t.id)}
          onPointerMove={handleUnsplitPointerMove}
          onPointerUp={handleUnsplitPointerUp}
          onPointerCancel={handleUnsplitPointerUp}
          title="Drag up to the tab bar to un-split"
        >
          <span className="shrink-0 text-[8px] leading-none text-muted-foreground/40">⠿</span>
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
            {t.title}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close pane"
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/pane:opacity-100"
          onClick={() => removeSplitTab(t.id)}
        >
          <svg width="9" height="9" viewBox="0 0 11 11" fill="none">
            <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {buildSplitPaneContent(t)}
      </div>
    </div>
  );

  const buildSplitPaneContent = (secTab: Tab) => {
    if (secTab.kind === "terminal") {
      return (
        <div className="absolute inset-0">
          <TerminalStack
            tabs={[secTab]}
            activeId={secTab.id}
            registerHandle={registerTerminalHandle}
            onSearchReady={handleSearchReady}
            onCwd={handleTerminalCwd}
            onExit={handleLeafExit}
            onFocusLeaf={handleFocusLeaf}
          />
        </div>
      );
    }
    const isSecEditor = secTab.kind === "editor";
    const isSecPreview = secTab.kind === "preview";
    const isSecMarkdown = secTab.kind === "markdown";
    const isSecMedia = secTab.kind === "media";
    const isSecSession = secTab.kind === "session";
    const isSecGitDiff = secTab.kind === "git-diff" || secTab.kind === "git-commit-file";
    const isSecGitHistory = secTab.kind === "git-history";
    return (
      <div className="relative h-full min-h-0">
        <div className={cn("absolute inset-0", !isSecEditor && "invisible pointer-events-none")} aria-hidden={!isSecEditor}>
          <EditorStack tabs={tabs} activeId={secTab.id} registerHandle={() => {}} onDirtyChange={() => {}} onCloseTab={() => {}} />
        </div>
        <div className={cn("absolute inset-0", !isSecPreview && "invisible pointer-events-none")} aria-hidden={!isSecPreview}>
          <PreviewStack tabs={tabs} activeId={secTab.id} registerHandle={() => {}} onUrlChange={() => {}} />
        </div>
        <div className={cn("absolute inset-0", !isSecMarkdown && "invisible pointer-events-none")} aria-hidden={!isSecMarkdown}>
          <MarkdownStack tabs={tabs} activeId={secTab.id} />
        </div>
        <div className={cn("absolute inset-0", !isSecMedia && "invisible pointer-events-none")} aria-hidden={!isSecMedia}>
          <MediaStack tabs={tabs} activeId={secTab.id} />
        </div>
        <div className={cn("absolute inset-0", !isSecSession && "invisible pointer-events-none")} aria-hidden={!isSecSession}>
          <SessionHistoryStack tabs={tabs} activeId={secTab.id} />
        </div>
        <div className={cn("absolute inset-0", !isSecGitDiff && "invisible pointer-events-none")} aria-hidden={!isSecGitDiff}>
          <GitDiffStack tabs={tabs} activeId={secTab.id} />
        </div>
        <div className={cn("absolute inset-0", !isSecGitHistory && "invisible pointer-events-none")} aria-hidden={!isSecGitHistory}>
          <GitHistoryStack tabs={tabs} activeId={secTab.id} onOpenCommitFile={openCommitFileDiffTab} onSearchHandle={() => {}} />
        </div>
      </div>
    );
  };

  const workspaceSurface = (
    <div className="relative h-full min-h-0">
      <div
        className={cn(
          "absolute inset-0",
          !isTerminalTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isTerminalTab}
      >
        <TerminalStack
          tabs={primaryTabs}
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
      {/* Extension tabs */}
      {isExtensionTab && activeTab && (() => {
        const renderer = findTabRenderer(activeTab.kind);
        if (!renderer) return (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            No renderer for {activeTab.kind}
          </div>
        );
        return (
          <div className="absolute inset-0">
            {renderer.render({ tabId: activeTab.id, data: (activeTab as ExtensionTab).data })}
          </div>
        );
      })()}
    </div>
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
                     onSelectTab={(id) =>
                       setSecondarySidebarState((prev) =>
                         id === prev.view ? closeSecondarySidebar(prev) : { view: id },
                       )
                     }
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
                  {hasSplit ? (() => {
                    const rowSplitTabs = tabs.filter((t) => rowSplitTabIds.includes(t.id));
                    const colSplitTabs = tabs.filter((t) => colSplitTabIds.includes(t.id));
                    const hasRowSplits = rowSplitTabs.length > 0;
                    const hasColSplits = colSplitTabs.length > 0;

                    // Left column: primary workspace + any "below" (col) splits stacked vertically
                    const leftColumnInner = hasColSplits ? (
                      <ResizablePanelGroup
                        key={`col-split-${colSplitTabs.length}`}
                        orientation="vertical"
                        className="min-h-0 flex-1 h-full"
                      >
                        <ResizablePanel
                          id="workspace-primary"
                          defaultSize={`${(100 / (colSplitTabs.length + 1)).toFixed(1)}%`}
                          minSize="15%"
                        >
                          <div className="relative h-full min-h-0">{workspaceSurface}</div>
                        </ResizablePanel>
                        {colSplitTabs.flatMap((t) => [
                          <ResizableHandle key={`col-handle-${t.id}`} />,
                          <ResizablePanel
                            key={`col-pane-${t.id}`}
                            id={`workspace-col-${t.id}`}
                            defaultSize={`${(100 / (colSplitTabs.length + 1)).toFixed(1)}%`}
                            minSize="15%"
                          >
                            {renderSplitPanel(t)}
                          </ResizablePanel>,
                        ])}
                      </ResizablePanelGroup>
                    ) : (
                      <div className="relative h-full min-h-0">{workspaceSurface}</div>
                    );

                    if (!hasRowSplits) {
                      return <div className="min-h-0 flex-1">{leftColumnInner}</div>;
                    }

                    return (
                      <ResizablePanelGroup
                        key={`row-split-${rowSplitTabs.length}`}
                        orientation="horizontal"
                        className="min-h-0 flex-1"
                      >
                        <ResizablePanel
                          id="workspace-left-col"
                          defaultSize={`${(100 / (rowSplitTabs.length + 1)).toFixed(1)}%`}
                          minSize="15%"
                        >
                          {leftColumnInner}
                        </ResizablePanel>
                        {rowSplitTabs.flatMap((t) => [
                          <ResizableHandle key={`row-handle-${t.id}`} />,
                          <ResizablePanel
                            key={`row-pane-${t.id}`}
                            id={`workspace-row-${t.id}`}
                            defaultSize={`${(100 / (rowSplitTabs.length + 1)).toFixed(1)}%`}
                            minSize="15%"
                          >
                            {renderSplitPanel(t)}
                          </ResizablePanel>,
                        ])}
                      </ResizablePanelGroup>
                    );
                  })() : (
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
              <SettingsPanel
                embedded
                activeTab={settingsDialogTab}
                onActiveTabChange={setSettingsDialogTab}
                onClose={closeSidebarSettings}
              />
            </DialogContent>
          </Dialog>

          <UnifiedPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            rootPath={explorerRoot ?? home}
            onOpenFile={handleOpenFile}
            initialQuery={paletteInitialQuery}
            onRunCommand={(id) => {
              const h = shortcutHandlers[id];
              if (h) h(new KeyboardEvent("keydown"));
            }}
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
          <AlertDialog
            open={pendingRunningTab !== null}
            onOpenChange={(open) => !open && cancelRunningClose()}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Running Process</AlertDialogTitle>
                <AlertDialogDescription>
                  A process is running in this terminal. Close it anyway?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelRunningClose}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmRunningClose}>
                  Close Anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
