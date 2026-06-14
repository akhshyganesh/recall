import type { FileExplorerHandle } from "@/modules/explorer";
import type { SidebarViewId } from "@/modules/sidebar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  readSecondarySidebarWidth,
  readSidebarPosition,
  readSidebarView,
  readSidebarWidth,
  RIGHT_PANEL_WIDTH_STORAGE_KEY,
  SIDEBAR_POSITION_STORAGE_KEY,
  SIDEBAR_VIEW_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  type SidebarPosition,
} from "./layoutPersistence";

export function useSidebarLayout({
  explorerRef,
}: {
  explorerRef: React.RefObject<FileExplorerHandle | null>;
}) {
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const secondarySidebarRef = useRef<PanelImperativeHandle | null>(null);
  const sidebarWidthRef = useRef(readSidebarWidth());
  const secondarySidebarWidthRef = useRef(readSecondarySidebarWidth());
  const sidebarWidthWriteTimerRef = useRef(0);
  const secondarySidebarWidthWriteTimerRef = useRef(0);
  const explorerReturnFocusRef = useRef<HTMLElement | null>(null);
  const [sidebarView, setSidebarViewState] = useState<SidebarViewId>(readSidebarView);
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
  }, [explorerRef, persistSidebarView, sidebarView]);

  return {
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
  };
}
