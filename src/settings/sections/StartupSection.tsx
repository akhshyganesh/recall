import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAutostart,
  setAutoUpdates,
  setRestoreWindowState,
} from "@/modules/settings/store";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function StartupSection() {
  const autostart = usePreferencesStore((s) => s.autostart);
  const autoUpdates = usePreferencesStore((s) => s.autoUpdates);
  const restoreWindowState = usePreferencesStore((s) => s.restoreWindowState);

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
    return () => {
      alive = false;
    };
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
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Startup"
        description="Launch behavior and window restore preferences."
      />

      <div className="flex flex-col gap-2">
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
          title="Install updates automatically"
          description="Download and apply new Recall releases automatically on supported platforms. Linux will still surface the manual release flow."
        >
          <Switch
            checked={autoUpdates}
            onCheckedChange={(value) => void setAutoUpdates(value)}
          />
        </SettingRow>

        <SettingRow
          title="Restore window position & size"
          description="Reopen the main window where you left it. Applies on next launch."
        >
          <Switch
            checked={restoreWindowState}
            onCheckedChange={(value) => void setRestoreWindowState(value)}
          />
        </SettingRow>
      </div>
    </div>
  );
}
