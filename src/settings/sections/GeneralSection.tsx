import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { ThemePref } from "@/modules/settings/store";
import { setShowHidden, setAutostart } from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect } from "react";
import { SettingsCard } from "../components/SettingsCard";
import { SettingRow } from "../components/SettingRow";

const APPEARANCE: {
  id: ThemePref;
  label: string;
  icon: typeof ComputerIcon;
}[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

export function GeneralSection() {
  const { theme, setTheme } = useTheme();
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const autostart = usePreferencesStore((s) => s.autostart);

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
      </SettingsCard>
    </div>
  );
}
