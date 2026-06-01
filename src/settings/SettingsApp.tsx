import { AppLogoMark } from "@/components/AppLogoMark";
import { WindowControls } from "@/components/WindowControls";
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import type { SettingsTab } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  ComputerIcon,
  DatabaseIcon,
  GridViewIcon,
  InformationCircleIcon,
  KeyboardIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useState, type JSX } from "react";
import { AboutSection } from "./sections/AboutSection";
import { EditorSection } from "./sections/EditorSection";
import { GeneralSection } from "./sections/GeneralSection";
import { PlannerMcpSection, SessionsMcpSection } from "./sections/McpSection";
import { PlannerSection } from "./sections/PlannerSection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { StartupSection } from "./sections/StartupSection";
import { TerminalSection } from "./sections/TerminalSection";

const TABS: {
  id: SettingsTab;
  label: string;
  group: "workspace" | "app" | "reference";
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  component: () => JSX.Element;
}[] = [
  {
    id: "general",
    label: "General",
    group: "workspace",
    icon: Settings01Icon,
    component: GeneralSection,
  },
  {
    id: "editor",
    label: "Editor",
    group: "workspace",
    icon: GridViewIcon,
    component: EditorSection,
  },
  {
    id: "terminal",
    label: "Terminal",
    group: "workspace",
    icon: ComputerIcon,
    component: TerminalSection,
  },
  {
    id: "planner",
    label: "Planner",
    group: "workspace",
    icon: DatabaseIcon,
    component: PlannerSection,
  },
  {
    id: "startup",
    label: "Startup",
    group: "app",
    icon: Settings01Icon,
    component: StartupSection,
  },
  {
    id: "sessions-mcp",
    label: "Session MCP",
    group: "app",
    icon: DatabaseIcon,
    component: SessionsMcpSection,
  },
  {
    id: "planner-mcp",
    label: "Planner MCP",
    group: "app",
    icon: DatabaseIcon,
    component: PlannerMcpSection,
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    group: "reference",
    icon: KeyboardIcon,
    component: ShortcutsSection,
  },
  {
    id: "about",
    label: "About",
    group: "reference",
    icon: InformationCircleIcon,
    component: AboutSection,
  },
];

const TAB_GROUPS: Array<{
  id: "workspace" | "app" | "reference";
  label: string;
}> = [
  { id: "workspace", label: "Workspace" },
  { id: "app", label: "App" },
  { id: "reference", label: "Reference" },
];

const VALID_TABS: SettingsTab[] = TABS.map((tab) => tab.id);

function normalizeTab(tab: string | null | undefined): SettingsTab {
  if (tab === "integrations" || tab === "mcp") return "sessions-mcp";
  if (tab && (VALID_TABS as string[]).includes(tab)) return tab as SettingsTab;
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
};

export function SettingsPanel({
  initialTab = "general",
  activeTab,
  onActiveTabChange,
  embedded = false,
}: SettingsPanelProps) {
  const [internalActive, setInternalActive] =
    useState<SettingsTab>(initialTab);
  const init = usePreferencesStore((s) => s.init);
  const active = activeTab ?? internalActive;
  const ActiveSection = TABS.find((t) => t.id === active)?.component ?? GeneralSection;

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
  }, [embedded, activeTab, onActiveTabChange]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-background text-foreground select-none",
        embedded ? "h-full" : "h-screen",
      )}
    >
      {!embedded && (
        <header
          data-tauri-drag-region
          className={`flex h-12 shrink-0 items-center justify-between border-b border-border/55 bg-card/60 ${
            IS_MAC ? "pr-3 pl-22" : "pr-0 pl-3"
          }`}
        >
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <span className="flex size-7 items-center justify-center rounded-md bg-background/80 ring-1 ring-border/55">
              <AppLogoMark />
            </span>
            <span className="text-[11px] font-bold text-foreground uppercase">
              Settings
            </span>
          </div>
          {USE_CUSTOM_WINDOW_CONTROLS && <WindowControls closeOnly />}
        </header>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[188px_minmax(0,1fr)] overflow-hidden">
        <aside className="flex min-w-0 flex-col border-r border-border/55 bg-card/25 px-3 py-4">
          <nav className="flex flex-col gap-3 overflow-y-auto pr-1">
            {TAB_GROUPS.map((group) => {
              const items = TABS.filter((tab) => tab.group === group.id);
              if (items.length === 0) return null;
              return (
                <div key={group.id} className="flex flex-col gap-1">
                  <div className="px-2 text-[10px] font-bold text-muted-foreground uppercase">
                    {group.label}
                  </div>
                  {items.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActive(t.id)}
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[12px] font-semibold transition-all",
                        active === t.id
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground hover:bg-background/75 hover:text-foreground",
                      )}
                    >
                      <HugeiconsIcon icon={t.icon} size={13} strokeWidth={1.75} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="min-h-0 overflow-y-auto bg-card/15 px-5 py-6 [-ms-overflow-style:none] [scrollbar-width:none] md:px-8 [&::-webkit-scrollbar]:hidden">
          <div className="w-full">
            <ActiveSection />
          </div>
        </main>
      </div>
    </div>
  );
}

export function SettingsApp() {
  return <SettingsPanel initialTab={readInitialTab()} />;
}
