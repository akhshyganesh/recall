export type {
  RecallExtension,
  RecallAPI,
  SidebarPanelDef,
  TabRendererDef,
  CommandDef,
  SettingsSectionDef,
  FileHandlerDef,
} from "./types";

export {
  useExtensionRegistry,
  loadExtension,
  unloadExtension,
  useExtensionSidebarPanels,
  useExtensionSettingsSections,
  useExtensionCommands,
  findTabRenderer,
  resolveExtensionTabKind,
} from "./registry";

export { loadInstalledExtensions } from "./loader";

export type { InstalledExtension, ExtensionSource } from "./store";
