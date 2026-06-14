import type { Tab } from "@/modules/tabs";
import React, { useCallback, useMemo, useRef, useState } from "react";

export function useSplitView({
  tabs,
  tabsRef,
  setActiveId,
}: {
  tabs: Tab[];
  tabsRef: React.MutableRefObject<Tab[]>;
  setActiveId: (updater: number | ((prev: number) => number)) => void;
}) {
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
    setActiveId((prev: number) => {
      if (prev !== tabId) return prev;
      const allSplit = new Set([...rowSplitTabIdsRef.current, ...colSplitTabIdsRef.current, tabId]);
      const other = tabsRef.current.find((t) => !allSplit.has(t.id));
      return other?.id ?? prev;
    });
  }, [setActiveId, tabsRef]);

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
  }, [unsplitDraggingTabId, removeSplitTab, setActiveId]);

  const draggingTab = useMemo(
    () =>
      unsplitDraggingTabId === null
        ? null
        : tabs.find((tab) => tab.id === unsplitDraggingTabId) ?? null,
    [tabs, unsplitDraggingTabId],
  );

  const splitTabs = tabs.filter((t) => rowSplitTabIds.includes(t.id) || colSplitTabIds.includes(t.id));
  const hasSplit = splitTabs.length > 0;
  const primaryTabs = hasSplit ? tabs.filter((t) => !rowSplitTabIds.includes(t.id) && !colSplitTabIds.includes(t.id)) : tabs;

  return {
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
  };
}
