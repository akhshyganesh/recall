import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  EDITOR_THEME_LABELS,
  EDITOR_THEMES,
  setEditorBreadcrumbs,
  setEditorStickyScroll,
  setEditorTheme,
  setVimMode,
  type EditorThemeId,
} from "@/modules/settings/store";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SettingsCard } from "../components/SettingsCard";
import { SettingRow } from "../components/SettingRow";

export function EditorSection() {
  const editorTheme = usePreferencesStore((s) => s.editorTheme);
  const vimMode = usePreferencesStore((s) => s.vimMode);
  const editorBreadcrumbs = usePreferencesStore((s) => s.editorBreadcrumbs);
  const editorStickyScroll = usePreferencesStore((s) => s.editorStickyScroll);

  const onPickEditor = (id: EditorThemeId) => void setEditorTheme(id);

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title="Theme">
        <SettingRow
          title="Editor theme"
          description="Choose the default theme for file editors and diffs."
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-8 min-w-44 justify-between gap-2 px-2.5 text-[12px]"
              >
                <span>{EDITOR_THEME_LABELS[editorTheme]}</span>
                <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {EDITOR_THEMES.map((themeId) => (
                <DropdownMenuItem
                  key={themeId}
                  onSelect={() => onPickEditor(themeId)}
                  className={cn("text-[12px]", themeId === editorTheme && "bg-accent/50")}
                >
                  {EDITOR_THEME_LABELS[themeId]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Editor features">
        <SettingRow
          title="Breadcrumbs"
          description="Show the file path and current symbol above the editor."
        >
          <Switch
            checked={editorBreadcrumbs}
            onCheckedChange={(value) => void setEditorBreadcrumbs(value)}
          />
        </SettingRow>
        <SettingRow
          title="Sticky scroll"
          description="Pin the enclosing function or class header to the top while scrolling."
        >
          <Switch
            checked={editorStickyScroll}
            onCheckedChange={(value) => void setEditorStickyScroll(value)}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Keybindings">
        <SettingRow
          title="Vim mode"
          description="Enable Vim keybindings in the code editor. Supports normal, insert, and visual modes."
        >
          <Switch
            checked={vimMode}
            onCheckedChange={(value) => void setVimMode(value)}
          />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
