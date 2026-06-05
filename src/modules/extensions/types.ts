import type { ReactNode } from "react";

// ── Sidebar panels ────────────────────────────────────────────────────────────

export interface SidebarPanelDef {
  /** Unique ID. Prefixed with the extension id by the registry, e.g. "my-ext:panel". */
  id: string;
  label: string;
  /** Any React node rendered as the icon in the sidebar rail (16 × 16 recommended). */
  icon: ReactNode;
  /** The panel body, rendered when this view is active. */
  render: () => ReactNode;
}

// ── Tab renderers ─────────────────────────────────────────────────────────────

export interface TabRendererDef {
  /** Called to check whether this renderer handles a given tab kind string. */
  canHandle: (kind: string) => boolean;
  render: (props: { tabId: number; data: unknown }) => ReactNode;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface CommandDef {
  label: string;
  handler: () => void;
  /** Optional keyboard shortcut in the format accepted by the shortcuts system. */
  keybinding?: string;
}

// ── Settings sections ─────────────────────────────────────────────────────────

export interface SettingsSectionDef {
  id: string;
  label: string;
  icon: ReactNode;
  render: () => ReactNode;
}

// ── File handlers ─────────────────────────────────────────────────────────────

export interface FileHandlerDef {
  /** File extension glob patterns, e.g. ["*.canvas", "*.drawio"]. */
  extensions: string[];
  /** Tab kind string passed to the registered TabRenderer. */
  tabKind: string;
}

// ── Public API handed to every extension on activate ─────────────────────────

export interface RecallAPI {
  /**
   * Register a panel that appears as a button in the sidebar rail.
   * Returns a cleanup function that removes the panel.
   */
  registerSidebarPanel(def: Omit<SidebarPanelDef, "id"> & { id?: string }): () => void;

  /** Register a renderer for a custom tab kind. Returns a cleanup function. */
  registerTabRenderer(kind: string, def: TabRendererDef): () => void;

  /** Register a named command accessible from the command palette. Returns cleanup. */
  registerCommand(id: string, def: CommandDef): () => void;

  /** Register an additional section in the Settings dialog. Returns cleanup. */
  registerSettingsSection(def: SettingsSectionDef): () => void;

  /** Map file extensions to a tab kind so the explorer can open them. Returns cleanup. */
  registerFileHandler(def: FileHandlerDef): () => void;
}

// ── Extension manifest ────────────────────────────────────────────────────────

export interface RecallExtension {
  /** Reverse-domain identifier, e.g. "com.acme.my-plugin". */
  id: string;
  name: string;
  version: string;
  description?: string;
  /**
   * Called once when the extension is loaded.
   * May return a cleanup function that is called on deactivation.
   */
  activate(api: RecallAPI): (() => void) | void;
}
