import { AppLogoMark } from "@/components/AppLogoMark";
import { WindowControls } from "@/components/WindowControls";
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import type { SettingsTab } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  Cancel01Icon,
  ComputerTerminal02Icon,
  InformationCircleIcon,
  KeyboardIcon,
  Link01Icon,
  PencilEdit02Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useState, type JSX } from "react";
import { AboutSection } from "./sections/AboutSection";
import { EditorSection } from "./sections/EditorSection";
import { GeneralSection } from "./sections/GeneralSection";
import { SessionsMcpSection } from "./sections/McpSection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { TerminalSection } from "./sections/TerminalSection";

const TABS: {
  id: SettingsTab;
  label: string;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  component: () => JSX.Element;
}[] = [
  { id: "general", label: "General", icon: SlidersHorizontalIcon, component: GeneralSection },
  { id: "terminal", label: "Terminal", icon: ComputerTerminal02Icon, component: TerminalSection },
  { id: "editor", label: "Editor", icon: PencilEdit02Icon, component: EditorSection },
  { id: "integrations", label: "Integrations", icon: Link01Icon, component: SessionsMcpSection },
  { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon, component: ShortcutsSection },
  { id: "about", label: "About", icon: InformationCircleIcon, component: AboutSection },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

function normalizeTab(tab: string | null | undefined): SettingsTab {
  if (tab === "sessions-mcp" || tab === "mcp" || tab === "integrations") return "integrations";
  if (tab === "startup" || tab === "extensions") return "general";
  if (tab && VALID_TABS.has(tab)) return tab as SettingsTab;
  return "general";
}

function readInitialTab(): SettingsTab {
  if (typeof window === "undefined") return "general";
  const url = new URL(window.location.href);
  return normalizeTab(url.searchParams.get("tab"));
}

type SettingsPanelProps = {
  initialTab?: SettingsTab;
  activeTab?: SettingsTab;
  onActiveTabChange?: (tab: SettingsTab) => void;
  embedded?: boolean;
  onClose?: () => void;
};

export function SettingsPanel({
  initialTab = "general",
  activeTab,
  onActiveTabChange,
  embedded = false,
  onClose,
}: SettingsPanelProps) {
  const [internalActive, setInternalActive] = useState<SettingsTab>(initialTab);
  const init = usePreferencesStore((s) => s.init);
  const active = activeTab ?? internalActive;
  const activeTabMeta = TABS.find((t) => t.id === active) ?? TABS[0];
  const ActiveSection = activeTabMeta.component;

  const setActive = (tab: SettingsTab) => {
    if (activeTab === undefined) setInternalActive(tab);
    onActiveTabChange?.(tab);
  };

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (activeTab === undefined) setInternalActive(initialTab);
  }, [activeTab, initialTab]);

  useEffect(() => {
    if (embedded) return;
    const unlistenPromise = getCurrentWebviewWindow().listen<string>(
      "recall:settings-tab",
      (e) => setActive(normalizeTab(e.payload)),
    );
    return () => {
      void unlistenPromise.then((un) => un());
    };
  }, [embedded]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-background text-foreground select-none",
        embedded ? "h-full" : "h-screen",
      )}
    >
      {/* Standalone window chrome */}
      {!embedded && (
        <header
          data-tauri-drag-region
          className={cn(
            "flex h-10 shrink-0 items-center gap-2.5 border-b border-border/30 bg-card/50",
            IS_MAC ? "pr-3 pl-22" : "pr-0 pl-4",
          )}
        >
          <span
            className="flex size-4 items-center justify-center opacity-50"
            data-tauri-drag-region
          >
            <AppLogoMark />
          </span>
          <span
            className="text-[11px] font-semibold tracking-tight text-foreground/55"
            data-tauri-drag-region
          >
            Settings
          </span>
          {USE_CUSTOM_WINDOW_CONTROLS && (
            <div className="ml-auto">
              <WindowControls closeOnly />
            </div>
          )}
        </header>
      )}

      {/* Tab strip + close */}
      <div className="flex shrink-0 items-stretch border-b border-border/30">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => {
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[11.5px] font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground/70 hover:text-foreground",
                )}
              >
                {isActive && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
                )}
                <HugeiconsIcon
                  icon={tab.icon}
                  size={13}
                  strokeWidth={isActive ? 2 : 1.75}
                  className="shrink-0"
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="flex shrink-0 items-center justify-center px-3 text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Section content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ActiveSection />
      </div>
    </div>
  );
}

export function SettingsApp() {
  return <SettingsPanel initialTab={readInitialTab()} />;
}
