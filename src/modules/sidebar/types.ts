export type CoreSidebarViewId = "sessions" | "explorer" | "search" | "extensions";

/**
 * Built-in view IDs plus any string registered by an extension.
 * Extension panel IDs are namespaced: "<extId>:<panelId>".
 */
export type SidebarViewId = CoreSidebarViewId | (string & {});
