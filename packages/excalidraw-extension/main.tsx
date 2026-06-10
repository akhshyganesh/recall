import "@excalidraw/excalidraw/index.css";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStorageKey(): string {
  return new URLSearchParams(window.location.search).get("key") ?? "";
}

function getTheme(): "light" | "dark" {
  // Prefer URL param; fall back to reading parent document classList (same-origin).
  const param = new URLSearchParams(window.location.search).get("theme");
  if (param === "light" || param === "dark") return param;
  try {
    return window.parent.document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

function loadCanvas(key: string): ExcalidrawInitialDataState | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ExcalidrawInitialDataState) : null;
  } catch {
    return null;
  }
}

function writeCanvas(
  key: string,
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        elements,
        appState: {
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom,
          viewBackgroundColor: appState.viewBackgroundColor,
        },
        files,
      }),
    );
  } catch {}
}

// ── Canvas app ────────────────────────────────────────────────────────────────

function CanvasApp() {
  const storageKey = getStorageKey();
  const [theme, setTheme] = useState<"light" | "dark">(getTheme);
  const initialData = useMemo(() => loadCanvas(storageKey), [storageKey]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{
    elements: readonly OrderedExcalidrawElement[];
    appState: AppState;
    files: BinaryFiles;
  } | null>(null);

  // Observe parent theme changes (same-origin).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const root = window.parent.document.documentElement;
      const obs = new MutationObserver(() => {
        setTheme(root.classList.contains("dark") ? "dark" : "light");
      });
      obs.observe(root, { attributes: true, attributeFilter: ["class"] });
      return () => obs.disconnect();
    } catch {
      // cross-origin fallback — no-op
    }
  }, [storageKey]);

  // Flush unsaved changes when unmounting.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        if (pendingRef.current && storageKey) {
          writeCanvas(storageKey, pendingRef.current.elements, pendingRef.current.appState, pendingRef.current.files);
        }
      }
    };
  }, [storageKey]);

  if (!storageKey) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: "sans-serif", color: "#888" }}>
        No canvas key provided.
      </div>
    );
  }

  const handleChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    pendingRef.current = { elements, appState, files };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (pendingRef.current) {
        writeCanvas(storageKey, pendingRef.current.elements, pendingRef.current.appState, pendingRef.current.files);
      }
      saveTimerRef.current = null;
    }, 800);
  };

  return (
    <Excalidraw
      initialData={initialData}
      onChange={handleChange}
      theme={theme}
      UIOptions={{
        canvasActions: { saveToActiveFile: false, loadScene: false, export: false },
      }}
    />
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<CanvasApp />);
}
