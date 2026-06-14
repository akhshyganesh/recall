import type { EditorPaneHandle } from "@/modules/editor";
import type { SearchInlineHandle } from "@/modules/header";
import {
  useGlobalShortcuts,
  type ShortcutHandlers,
  type ShortcutId,
} from "@/modules/shortcuts";
import type { SidebarViewId } from "@/modules/sidebar";
import type { Tab } from "@/modules/tabs";
import type { TerminalPaneHandle } from "@/modules/terminal";
import type React from "react";
import { useCallback, useMemo } from "react";

export function useAppShortcuts({
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
}: {
  activeId: number;
  activeLeafId: number | null;
  activeTab: Tab | undefined;
  activeTerminalLeafCwd: string | null;
  terminalRefs: React.MutableRefObject<Map<number, TerminalPaneHandle>>;
  editorRefs: React.MutableRefObject<Map<number, EditorPaneHandle>>;
  searchInlineRef: React.MutableRefObject<SearchInlineHandle | null>;
  openNewTab: () => void;
  openPreviewTab: (url: string) => number;
  setNewEditorOpen: (open: boolean) => void;
  handleCloseTabOrPane: () => void;
  cycleTab: (delta: 1 | -1) => void;
  selectByIndex: (index: number) => void;
  splitActivePaneInActiveTab: (dir: "row" | "col") => void;
  focusNextPaneInTab: (tabId: number, delta: 1 | -1) => void;
  toggleSourceControl: () => void;
  openSidebarSettings: (tab?: string) => void;
  setPaletteInitialQuery: (q: string) => void;
  setPaletteOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  cycleSidebarView: (view: SidebarViewId) => void;
  swapSidebarPosition: () => void;
  toggleExplorerFocus: () => void;
  openProjectSearch: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  setZenMode: React.Dispatch<React.SetStateAction<boolean>>;
}): ShortcutHandlers {
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
      "search.project": openProjectSearch,
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
      "editor.goToSymbol": () => {
        setPaletteInitialQuery("@");
        setPaletteOpen(true);
      },
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
      openProjectSearch,
      zoomIn,
      zoomOut,
      zoomReset,
      editorRefs,
      searchInlineRef,
      setNewEditorOpen,
      setPaletteInitialQuery,
      setPaletteOpen,
      setZenMode,
      terminalRefs,
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId) => {
      if (
        id === "editor.undo" ||
        id === "editor.redo" ||
        id === "editor.goToSymbol"
      ) {
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

  return shortcutHandlers;
}
