import { create } from "zustand";
import type {
  BackgroundDef,
  CommandDef,
  FileHandlerDef,
  RecallAPI,
  RecallExtension,
  SettingsSectionDef,
  SidebarPanelDef,
  TabRendererDef,
} from "./types";

// ── State shape ───────────────────────────────────────────────────────────────
// Arrays (not Maps) for all lists that React hooks read.
// Zustand's default Object.is check then gives stable references between
// renders unless something is actually added/removed — avoiding infinite loops.

interface ExtensionRegistryState {
  extensionIds: string[];

  sidebarPanels: SidebarPanelDef[];
  tabRenderers: Array<{ kind: string; def: TabRendererDef }>;
  commands: Array<{ id: string; def: CommandDef }>;
  settingsSections: SettingsSectionDef[];
  fileHandlers: FileHandlerDef[];
  backgrounds: BackgroundDef[];

  _addSidebarPanel: (def: SidebarPanelDef) => void;
  _removeSidebarPanel: (id: string) => void;
  _addTabRenderer: (kind: string, def: TabRendererDef) => void;
  _removeTabRenderer: (kind: string) => void;
  _addCommand: (id: string, def: CommandDef) => void;
  _removeCommand: (id: string) => void;
  _addSettingsSection: (def: SettingsSectionDef) => void;
  _removeSettingsSection: (id: string) => void;
  _addFileHandler: (def: FileHandlerDef) => void;
  _removeFileHandler: (def: FileHandlerDef) => void;
  _addBackground: (def: BackgroundDef) => void;
  _removeBackground: (id: string) => void;
  _registerExtensionId: (id: string) => void;
  _unregisterExtensionId: (id: string) => void;
}

export const useExtensionRegistry = create<ExtensionRegistryState>((set) => ({
  extensionIds: [],
  sidebarPanels: [],
  tabRenderers: [],
  commands: [],
  settingsSections: [],
  fileHandlers: [],
  backgrounds: [],

  _addSidebarPanel: (def) =>
    set((s) => ({ sidebarPanels: [...s.sidebarPanels, def] })),
  _removeSidebarPanel: (id) =>
    set((s) => ({ sidebarPanels: s.sidebarPanels.filter((p) => p.id !== id) })),

  _addTabRenderer: (kind, def) =>
    set((s) => ({ tabRenderers: [...s.tabRenderers, { kind, def }] })),
  _removeTabRenderer: (kind) =>
    set((s) => ({ tabRenderers: s.tabRenderers.filter((r) => r.kind !== kind) })),

  _addCommand: (id, def) =>
    set((s) => ({ commands: [...s.commands, { id, def }] })),
  _removeCommand: (id) =>
    set((s) => ({ commands: s.commands.filter((c) => c.id !== id) })),

  _addSettingsSection: (def) =>
    set((s) => ({ settingsSections: [...s.settingsSections, def] })),
  _removeSettingsSection: (id) =>
    set((s) => ({ settingsSections: s.settingsSections.filter((s2) => s2.id !== id) })),

  _addFileHandler: (def) =>
    set((s) => ({ fileHandlers: [...s.fileHandlers, def] })),
  _removeFileHandler: (def) =>
    set((s) => ({ fileHandlers: s.fileHandlers.filter((h) => h !== def) })),

  _addBackground: (def) =>
    set((s) => ({ backgrounds: [...s.backgrounds, def] })),
  _removeBackground: (id) =>
    set((s) => ({ backgrounds: s.backgrounds.filter((b) => b.id !== id) })),

  _registerExtensionId: (id) =>
    set((s) => ({ extensionIds: [...s.extensionIds, id] })),
  _unregisterExtensionId: (id) =>
    set((s) => ({ extensionIds: s.extensionIds.filter((x) => x !== id) })),
}));

// ── Build the RecallAPI for a single extension ────────────────────────────────

function buildApiForExtension(extId: string): RecallAPI {
  const store = useExtensionRegistry.getState();

  return {
    registerSidebarPanel(partial) {
      const id = partial.id ? `${extId}:${partial.id}` : extId;
      const def: SidebarPanelDef = { ...partial, id };
      store._addSidebarPanel(def);
      return () => useExtensionRegistry.getState()._removeSidebarPanel(id);
    },

    registerTabRenderer(kind, def) {
      const qualifiedKind = `${extId}:${kind}`;
      store._addTabRenderer(qualifiedKind, def);
      return () => useExtensionRegistry.getState()._removeTabRenderer(qualifiedKind);
    },

    registerCommand(id, def) {
      const qualifiedId = `${extId}:${id}`;
      store._addCommand(qualifiedId, def);
      return () => useExtensionRegistry.getState()._removeCommand(qualifiedId);
    },

    registerSettingsSection(def) {
      const qualifiedDef = { ...def, id: `${extId}:${def.id}` };
      store._addSettingsSection(qualifiedDef);
      return () => useExtensionRegistry.getState()._removeSettingsSection(qualifiedDef.id);
    },

    registerFileHandler(def) {
      store._addFileHandler(def);
      return () => useExtensionRegistry.getState()._removeFileHandler(def);
    },

    registerBackground(id, render) {
      const qualifiedId = `${extId}:${id}`;
      store._addBackground({ id: qualifiedId, render });
      return () => useExtensionRegistry.getState()._removeBackground(qualifiedId);
    },

    openTab(kind, title, data) {
      const qualifiedKind = `${extId}:${kind}`;
      window.dispatchEvent(
        new CustomEvent("recall:open-extension-tab", {
          detail: { kind: qualifiedKind, title, data },
        }),
      );
    },
  };
}

// ── Load / unload a single extension ─────────────────────────────────────────

const cleanupFns = new Map<string, () => void>();

export function loadExtension(ext: RecallExtension): void {
  if (useExtensionRegistry.getState().extensionIds.includes(ext.id)) {
    console.warn(`[extensions] "${ext.id}" is already loaded — skipping`);
    return;
  }
  const api = buildApiForExtension(ext.id);
  try {
    const cleanup = ext.activate(api);
    if (typeof cleanup === "function") cleanupFns.set(ext.id, cleanup);
    useExtensionRegistry.getState()._registerExtensionId(ext.id);
  } catch (err) {
    console.error(`[extensions] Failed to activate "${ext.id}":`, err);
  }
}

export function unloadExtension(id: string): void {
  const cleanup = cleanupFns.get(id);
  if (cleanup) {
    try { cleanup(); } catch { /* ignore */ }
    cleanupFns.delete(id);
  }
  useExtensionRegistry.getState()._unregisterExtensionId(id);
}

// ── React selectors ───────────────────────────────────────────────────────────
// These return the stored array directly — stable reference between renders
// unless a panel is actually added or removed.

export function useExtensionSidebarPanels(): SidebarPanelDef[] {
  return useExtensionRegistry((s) => s.sidebarPanels);
}

export function useExtensionSettingsSections(): SettingsSectionDef[] {
  return useExtensionRegistry((s) => s.settingsSections);
}

export function useExtensionCommands(): Array<{ id: string; def: CommandDef }> {
  return useExtensionRegistry((s) => s.commands);
}

export function useExtensionBackgrounds(): BackgroundDef[] {
  return useExtensionRegistry((s) => s.backgrounds);
}

// ── Non-hook helpers ──────────────────────────────────────────────────────────

export function findTabRenderer(kind: string): TabRendererDef | undefined {
  return useExtensionRegistry
    .getState()
    .tabRenderers.find((r) => r.def.canHandle(kind))?.def;
}

export function resolveExtensionTabKind(path: string): string | null {
  const { fileHandlers } = useExtensionRegistry.getState();
  const filename = path.split(/[\\/]/).pop() ?? path;
  for (const handler of fileHandlers) {
    for (const pattern of handler.extensions) {
      const regex = new RegExp(
        "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$",
        "i",
      );
      if (regex.test(filename)) return handler.tabKind;
    }
  }
  return null;
}
