import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  TERMINAL_FONT_SIZES,
  TERMINAL_SCROLLBACK_PRESETS,
  setTerminalFontFamily,
  setTerminalLetterSpacing,
  setTerminalFontSize,
  setTerminalScrollback,
  setTerminalWebglEnabled,
} from "@/modules/settings/store";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function TerminalSection() {
  const terminalWebglEnabled = usePreferencesStore(
    (s) => s.terminalWebglEnabled,
  );
  const terminalFontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const terminalLetterSpacing = usePreferencesStore(
    (s) => s.terminalLetterSpacing,
  );
  const terminalFontSize = usePreferencesStore((s) => s.terminalFontSize);
  const terminalScrollback = usePreferencesStore((s) => s.terminalScrollback);

  const onToggleTerminalWebgl = (next: boolean) => {
    void setTerminalWebglEnabled(next).catch((error) =>
      console.error("terminal WebGL preference update failed", error),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Terminal"
        description="Rendering, font, and scrollback behavior."
      />

      <div className="flex flex-col gap-2">
        <SettingRow
          title={
            <span className="inline-flex items-center gap-1.5">
              Use WebGL renderer
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="cursor-help text-[11px] text-muted-foreground/70 leading-none"
                      aria-label="More info about WebGL renderer"
                    >
                      ⓘ
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-65 text-[11px]"
                  >
                    xterm's WebGL renderer caches glyphs in a GPU texture atlas.
                    On some macOS setups, the atlas can corrupt and terminal
                    text becomes unreadable. Disable WebGL as a safe fallback.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          }
          description="Hardware-accelerated rendering. Turn off if text shows corruption or blank tiles."
        >
          <Switch
            checked={terminalWebglEnabled}
            onCheckedChange={onToggleTerminalWebgl}
          />
        </SettingRow>

        <SettingRow
          title="Font family"
          description='Nerd Font name for icons (for example "CaskaydiaCove Nerd Font Mono"). Leave blank to auto-detect.'
        >
          <input
            type="text"
            value={terminalFontFamily}
            placeholder="Auto-detect"
            onChange={(event) => void setTerminalFontFamily(event.target.value)}
            className="h-8 w-56 rounded-md border border-border/70 bg-background px-2.5 text-[12px] outline-none transition-colors focus:border-foreground/40"
          />
        </SettingRow>

        <SettingRow
          title="Letter spacing"
          description="Extra horizontal space between characters in pixels. Use negative values to tighten Nerd Fonts."
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-8 min-w-28 justify-between gap-2 rounded-md px-2.5 text-[12px]"
              >
                <span>
                  {terminalLetterSpacing > 0
                    ? `+${terminalLetterSpacing}`
                    : terminalLetterSpacing}{" "}
                  px
                </span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={12}
                  strokeWidth={2}
                  className="opacity-70"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-25 rounded-md border border-border/70 bg-popover p-1 shadow-lg shadow-background/10 ring-0"
            >
              {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((value) => (
                <DropdownMenuItem
                  key={value}
                  onSelect={() => void setTerminalLetterSpacing(value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[12px]",
                    value === terminalLetterSpacing && "bg-accent/50",
                  )}
                >
                  {value > 0 ? `+${value}` : value} px
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingRow>

        <SettingRow title="Font size" description="Terminal text size.">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-8 min-w-24 justify-between gap-2 rounded-md px-2.5 text-[12px]"
              >
                <span>{terminalFontSize} px</span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={12}
                  strokeWidth={2}
                  className="opacity-70"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-20 rounded-md border border-border/70 bg-popover p-1 shadow-lg shadow-background/10 ring-0"
            >
              {TERMINAL_FONT_SIZES.map((size) => (
                <DropdownMenuItem
                  key={size}
                  onSelect={() => void setTerminalFontSize(size)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[12px]",
                    size === terminalFontSize && "bg-accent/50",
                  )}
                >
                  {size} px
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingRow>

        <SettingRow
          title="Scrollback"
          description="Lines of history kept per terminal. Higher values use more RAM."
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-8 min-w-36 justify-between gap-2 rounded-md px-2.5 text-[12px]"
              >
                <span>{terminalScrollback.toLocaleString()} lines</span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={12}
                  strokeWidth={2}
                  className="opacity-70"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-35 rounded-md border border-border/70 bg-popover p-1 shadow-lg shadow-background/10 ring-0"
            >
              {TERMINAL_SCROLLBACK_PRESETS.map((lines) => (
                <DropdownMenuItem
                  key={lines}
                  onSelect={() => void setTerminalScrollback(lines)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[12px]",
                    lines === terminalScrollback && "bg-accent/50",
                  )}
                >
                  {lines.toLocaleString()} lines
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingRow>
      </div>
    </div>
  );
}