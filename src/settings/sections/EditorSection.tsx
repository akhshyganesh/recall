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
  setEditorTheme,
  setVimMode,
  type EditorThemeId,
} from "@/modules/settings/store";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function EditorSection() {
  const editorTheme = usePreferencesStore((s) => s.editorTheme);
  const vimMode = usePreferencesStore((s) => s.vimMode);

  const onPickEditor = (id: EditorThemeId) => void setEditorTheme(id);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Editor"
        description="CodeMirror theme and editing behavior."
      />

      <div className="flex flex-col gap-2">
        <SettingRow
          title="Editor theme"
          description="Choose the default theme for file editors and diffs."
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 justify-between gap-2 px-2.5 text-[12px]"
              >
                <span>{EDITOR_THEME_LABELS[editorTheme]}</span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={12}
                  strokeWidth={2}
                  className="opacity-70"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {EDITOR_THEMES.map((themeId) => (
                <DropdownMenuItem
                  key={themeId}
                  onSelect={() => onPickEditor(themeId)}
                  className={cn(
                    "text-[12px]",
                    themeId === editorTheme && "bg-accent/50",
                  )}
                >
                  {EDITOR_THEME_LABELS[themeId]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingRow>

        <SettingRow
          title="Vim mode"
          description="Enable Vim keybindings in the code editor."
        >
          <Switch
            checked={vimMode}
            onCheckedChange={(value) => void setVimMode(value)}
          />
        </SettingRow>
      </div>
    </div>
  );
}