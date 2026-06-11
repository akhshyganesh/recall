import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { ThemePref } from "@/modules/settings/store";
import { setShowHidden, setAutostart, setCheckForUpdates, setZoomLevel } from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import {
  ComputerIcon,
  SidebarLeft01Icon,
  SidebarRight01Icon,
  Moon02Icon,
  MinusSignIcon,
  PlusSignIcon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";
import { SettingsCard } from "../components/SettingsCard";
import { SettingRow } from "../components/SettingRow";

const SIDEBAR_POSITION_KEY = "recall.sidebar.position";
const SIDEBAR_POSITION_EVENT = "recall:sidebar-position-changed";

type SidebarPosition = "left" | "right";

function readSidebarPosition(): SidebarPosition {
  try {
    const v = window.localStorage.getItem(SIDEBAR_POSITION_KEY);
    if (v === "left" || v === "right") return v;
  } catch {}
  return "left";
}

function SidebarPositionToggle() {
  const [position, setPositionState] = useState<SidebarPosition>(readSidebarPosition);

  useEffect(() => {
    const handler = () => setPositionState(readSidebarPosition());
    window.addEventListener(SIDEBAR_POSITION_EVENT, handler);
    return () => window.removeEventListener(SIDEBAR_POSITION_EVENT, handler);
  }, []);

  const select = (next: SidebarPosition) => {
    try { window.localStorage.setItem(SIDEBAR_POSITION_KEY, next); } catch {}
    window.dispatchEvent(new CustomEvent(SIDEBAR_POSITION_EVENT));
    setPositionState(next);
  };

  const OPTIONS: { value: SidebarPosition; label: string; icon: typeof SidebarLeft01Icon }[] = [
    { value: "left", label: "Left", icon: SidebarLeft01Icon },
    { value: "right", label: "Right", icon: SidebarRight01Icon },
  ];

  return (
    <div className="flex gap-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => select(o.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11.5px] font-medium transition-all",
            position === o.value
              ? "border-foreground/30 bg-foreground/8 text-foreground"
              : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
          )}
        >
          <HugeiconsIcon icon={o.icon} size={13} strokeWidth={position === o.value ? 2 : 1.75} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

const APPEARANCE: {
  id: ThemePref;
  label: string;
  icon: typeof ComputerIcon;
}[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

const ACCENT_PRESETS: { label: string; hue: number }[] = [
  { label: "Purple", hue: 300 },
  { label: "Violet", hue: 280 },
  { label: "Blue", hue: 220 },
  { label: "Cyan", hue: 190 },
  { label: "Green", hue: 140 },
  { label: "Amber", hue: 55 },
  { label: "Orange", hue: 30 },
  { label: "Red", hue: 10 },
  { label: "Pink", hue: 340 },
];

function AccentColorPicker() {
  const { accentHue, setAccentHue, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  function swatchColor(hue: number): string {
    return isDark ? `oklch(0.76 0.16 ${hue})` : `oklch(0.58 0.18 ${hue})`;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Preset swatches */}
      <div className="flex flex-wrap gap-2">
        {ACCENT_PRESETS.map((p) => {
          const isActive = Math.abs(accentHue - p.hue) < 5;
          return (
            <button
              key={p.hue}
              type="button"
              title={p.label}
              onClick={() => setAccentHue(p.hue)}
              className={cn(
                "size-6 rounded-full border-2 transition-all hover:scale-110",
                isActive
                  ? "border-primary"
                  : "border-transparent hover:border-foreground/30",
              )}
              style={{ background: swatchColor(p.hue) }}
            />
          );
        })}
      </div>
      {/* Hue slider */}
      <div className="flex items-center gap-3">
        <div className="relative h-5 flex-1">
          {/* Gradient track */}
          <div
            className="pointer-events-none absolute inset-x-0 my-auto h-2 rounded-full"
            style={{
              top: "calc(50% - 4px)",
              background:
                "linear-gradient(to right, oklch(0.65 0.18 0), oklch(0.65 0.18 45), oklch(0.65 0.18 90), oklch(0.65 0.18 135), oklch(0.65 0.18 180), oklch(0.65 0.18 225), oklch(0.65 0.18 270), oklch(0.65 0.18 315), oklch(0.65 0.18 360))",
            }}
          />
          {/* Thumb */}
          <div
            className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background ring-1 ring-foreground/10"
            style={{
              left: `${(accentHue / 359) * 100}%`,
              background: swatchColor(accentHue),
            }}
          />
          {/* Invisible range input for interaction */}
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={accentHue}
            onChange={(e) => setAccentHue(Number(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <span className="w-9 text-right font-mono text-[11px] text-muted-foreground/60">
          {accentHue}°
        </span>
      </div>
    </div>
  );
}

const ZOOM_PRESETS = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0] as const;
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z * 100) / 100));
}

function InterfaceScaleControl() {
  const zoomLevel = usePreferencesStore((s) => s.zoomLevel);

  const adjust = (delta: number) => {
    void setZoomLevel(clampZoom(zoomLevel + delta));
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => adjust(-ZOOM_STEP)}
        disabled={zoomLevel <= MIN_ZOOM}
        className="flex size-6 items-center justify-center rounded border border-border/40 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-40"
      >
        <HugeiconsIcon icon={MinusSignIcon} size={11} strokeWidth={2} />
      </button>
      <div className="flex gap-1">
        {ZOOM_PRESETS.map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => void setZoomLevel(z)}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[10.5px] transition-colors",
              Math.abs(zoomLevel - z) < 0.01
                ? "bg-primary/15 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Math.round(z * 100)}%
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => adjust(ZOOM_STEP)}
        disabled={zoomLevel >= MAX_ZOOM}
        className="flex size-6 items-center justify-center rounded border border-border/40 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-40"
      >
        <HugeiconsIcon icon={PlusSignIcon} size={11} strokeWidth={2} />
      </button>
    </div>
  );
}

export function GeneralSection() {
  const { theme, setTheme } = useTheme();
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const autostart = usePreferencesStore((s) => s.autostart);
  const checkForUpdates = usePreferencesStore((s) => s.checkForUpdates);

  useEffect(() => {
    let alive = true;
    void isEnabled()
      .then((on) => {
        if (!alive) return;
        if (on !== usePreferencesStore.getState().autostart) {
          void setAutostart(on);
        }
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const onToggleAutostart = async (next: boolean) => {
    try {
      if (next) await enable();
      else await disable();
      await setAutostart(next);
    } catch (error) {
      console.error("autostart toggle failed", error);
    }
  };

  return (
    <div className="flex flex-col">
      <SettingsCard title="Appearance">
        <SettingRow title="Theme" description="App color scheme.">
          <div className="flex gap-1">
            {APPEARANCE.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setTheme(o.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11.5px] font-medium transition-all",
                  theme === o.id
                    ? "border-foreground/30 bg-foreground/8 text-foreground"
                    : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <HugeiconsIcon
                  icon={o.icon}
                  size={13}
                  strokeWidth={theme === o.id ? 2 : 1.75}
                />
                {o.label}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow
          title="Accent color"
          description="Primary color used for buttons and highlights."
          className="flex-col items-start gap-2"
        >
          <div className="w-full">
            <AccentColorPicker />
          </div>
        </SettingRow>
        <SettingRow
          title="Sidebar position"
          description="Which side the file explorer and sessions panel appears on."
        >
          <SidebarPositionToggle />
        </SettingRow>
        <SettingRow
          title="Interface scale"
          description="Scales the UI including the sidebar, status bar, and editor. Also adjustable with ⌘+ / ⌘−."
          className="flex-col items-start gap-2"
        >
          <InterfaceScaleControl />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Files">
        <SettingRow
          title="Show hidden files"
          description="Include dot-prefixed files and folders in the explorer."
        >
          <Switch
            checked={showHidden}
            onCheckedChange={(v) => void setShowHidden(v)}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Startup">
        <SettingRow
          title="Launch at login"
          description="Open Recall automatically when you sign in."
        >
          <Switch
            checked={autostart}
            onCheckedChange={(value) => void onToggleAutostart(value)}
          />
        </SettingRow>
        <SettingRow
          title="Check for updates on launch"
          description="Look for a new version each time Recall opens."
        >
          <Switch
            checked={checkForUpdates}
            onCheckedChange={(v) => void setCheckForUpdates(v)}
          />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
