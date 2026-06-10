import { KEY_SEP } from "@/lib/platform";
import type { EditorPaneHandle } from "@/modules/editor";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getBindingTokens, SHORTCUTS } from "@/modules/shortcuts/shortcuts";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SearchAddon } from "@xterm/addon-search";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

const TERM_DECORATIONS = {
  matchBackground: "#a07c00",
  matchBorder: "#d4a800",
  matchOverviewRuler: "#d4a800",
  activeMatchBackground: "#c97800",
  activeMatchBorder: "#ffcc00",
  activeMatchColorOverviewRuler: "#ffcc00",
};

export type SearchTarget =
  | { kind: "terminal"; addon: SearchAddon; focus: () => void }
  | { kind: "editor"; handle: EditorPaneHandle; focus: () => void }
  | {
      kind: "git-history";
      handle: { setQuery: (q: string) => void; clearQuery: () => void };
      focus: () => void;
    }
  | null;

export type SearchInlineHandle = { focus: () => void };

type Props = {
  target: SearchTarget;
  compact?: boolean;
};

export const SearchInline = forwardRef<SearchInlineHandle, Props>(
  function SearchInline({ target, compact }, ref) {
    const [q, setQ] = useState("");
    const [openInCompact, setOpenInCompact] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const pendingFocusRef = useRef(false);
    const setInputRef = useCallback((el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (!el || !pendingFocusRef.current) return;
      pendingFocusRef.current = false;
      el.focus();
    }, []);

    const userShortcuts = usePreferencesStore((s) => s.shortcuts);

    const shortcutTokens = useMemo(() => {
      const s = SHORTCUTS.find((s) => s.id === "search.focus");
      if (!s) return "";
      const bindings = userShortcuts["search.focus"] || s.defaultBindings;
      if (!bindings || bindings.length === 0) return "";
      return getBindingTokens(bindings[0]).join(KEY_SEP);
    }, [userShortcuts]);

    const baseLabel = target?.kind === "git-history" ? "Git search" : "Search";

    const placeholder = useMemo(
      () => (shortcutTokens ? `${baseLabel} (${shortcutTokens})` : baseLabel),
      [baseLabel, shortcutTokens],
    );

    const expanded = !compact || openInCompact;

    const focus = useCallback(() => {
      pendingFocusRef.current = true;
      if (compact) setOpenInCompact(true);
      else inputRef.current?.focus();
      if (inputRef.current) pendingFocusRef.current = false;
    }, [compact]);

    useImperativeHandle(ref, () => ({ focus }), [focus]);

    const clearTarget = useCallback(() => {
      if (!target) return;
      if (target.kind === "terminal") target.addon.clearDecorations();
      else target.handle.clearQuery();
    }, [target]);

    const restoreTargetFocus = useCallback(() => {
      if (!target) return;
      target.focus();
    }, [target]);

    useEffect(() => clearTarget, [clearTarget]);

    const applyIncremental = (next: string) => {
      if (!target) return;
      if (target.kind === "terminal") {
        if (next) {
          target.addon.findNext(next, { incremental: true, decorations: TERM_DECORATIONS });
        } else {
          target.addon.clearDecorations();
        }
      } else {
        target.handle.setQuery(next);
      }
    };

    const findDirection = (forward: boolean) => {
      if (!target || !q) return;
      if (target.kind === "terminal") {
        const opts = { decorations: TERM_DECORATIONS };
        if (forward) target.addon.findNext(q, opts);
        else target.addon.findPrevious(q, opts);
      } else if (target.kind === "editor") {
        if (forward) target.handle.findNext();
        else target.handle.findPrevious();
      }
    };

    const collapsedWidth = shortcutTokens ? 132 : 96;

    return (
      <div
        style={{ width: expanded ? 220 : compact ? collapsedWidth : 220 }}
        className="relative h-7 shrink-0 self-center overflow-hidden transition-[width] duration-200 ease-in-out"
      >
        {expanded ? (
          <div className="absolute inset-0 flex items-center animate-in fade-in-0 duration-[100ms]">
            <div className="group flex h-full w-full items-center gap-1.5 rounded-full border border-border/50 bg-muted/35 pl-2.5 pr-1.5 transition-colors focus-within:border-primary/40 focus-within:bg-muted/55 focus-within:ring-1 focus-within:ring-primary/15">
              <HugeiconsIcon
                icon={Search01Icon}
                size={12}
                strokeWidth={1.75}
                className="shrink-0 text-muted-foreground/55 transition-colors group-focus-within:text-primary/70"
              />
              <input
                ref={setInputRef}
                value={q}
                placeholder={placeholder}
                className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/45"
                onChange={(e) => {
                  const next = e.target.value;
                  setQ(next);
                  applyIncremental(next);
                }}
                onBlur={() => {
                  if (compact && !q) setOpenInCompact(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    findDirection(!e.shiftKey);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    clearTarget();
                    setQ("");
                    if (compact) setOpenInCompact(false);
                    restoreTargetFocus();
                  }
                }}
              />
              {q && (
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    clearTarget();
                    inputRef.current?.focus();
                  }}
                  className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted-foreground/18 text-muted-foreground/60 transition-colors hover:bg-muted-foreground/28 hover:text-foreground"
                  aria-label="Clear search"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center animate-in fade-in-0 duration-[100ms]">
            <button
              type="button"
              onClick={focus}
              title={placeholder}
              className="flex h-full w-full items-center gap-1.5 rounded-full border border-border/45 bg-muted/25 pl-2.5 pr-2 text-muted-foreground/60 transition-colors hover:border-border/65 hover:bg-muted/50 hover:text-muted-foreground"
            >
              <HugeiconsIcon
                icon={Search01Icon}
                size={12}
                strokeWidth={1.75}
                className="shrink-0"
              />
              <span className="flex-1 truncate text-left text-[12px]">
                {baseLabel}
              </span>
              {shortcutTokens && (
                <span className="shrink-0 rounded border border-border/40 bg-background/40 px-1 py-px font-mono text-[9.5px] text-muted-foreground/45">
                  {shortcutTokens}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    );
  },
);
