export type SettingsTab =
  | "general"
  | "editor"
  | "terminal"
  | "integrations"
  | "shortcuts"
  | "about";

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  general: "General",
  editor: "Editor",
  terminal: "Terminal",
  integrations: "Integrations",
  shortcuts: "Shortcuts",
  about: "About",
};

export const SETTINGS_TAB_REQUEST_EVENT = "recall:open-settings-tab";

type SettingsTabRequest = {
  tab: SettingsTab;
};

export function settingsTabTitle(tab: SettingsTab = "general"): string {
  return SETTINGS_TAB_LABELS[tab];
}

export function requestSettingsTab(tab: SettingsTab = "general"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SettingsTabRequest>(SETTINGS_TAB_REQUEST_EVENT, {
      detail: { tab },
    }),
  );
}

export function listenSettingsTabRequests(
  onRequest: (tab: SettingsTab) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const tab = (event as CustomEvent<SettingsTabRequest>).detail?.tab;
    onRequest(tab ?? "general");
  };
  window.addEventListener(SETTINGS_TAB_REQUEST_EVENT, listener);
  return () => window.removeEventListener(SETTINGS_TAB_REQUEST_EVENT, listener);
}

export async function openSettingsWindow(tab?: SettingsTab): Promise<void> {
  requestSettingsTab(tab);
}
