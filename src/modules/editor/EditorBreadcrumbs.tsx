import { memo } from "react";
import type { EditorSymbol } from "./lib/symbols";

const MAX_PATH_SEGMENTS = 4;

type Props = {
  path: string;
  symbols: EditorSymbol[];
};

/**
 * Compact one-line breadcrumbs bar: trailing path segments plus the symbol
 * chain at the cursor (e.g. ClassName › methodName). The symbol part hides
 * itself when the language has no extractable symbols; the path always
 * shows.
 */
export const EditorBreadcrumbs = memo(function EditorBreadcrumbs({
  path,
  symbols,
}: Props) {
  const allSegments = path.split(/[/\\]/).filter(Boolean);
  const truncated = allSegments.length > MAX_PATH_SEGMENTS;
  const segments = truncated
    ? allSegments.slice(-MAX_PATH_SEGMENTS)
    : allSegments;

  return (
    <div
      className="flex h-6 shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap border-b border-border/40 px-3 text-[11px] text-muted-foreground"
      title={path}
    >
      {truncated && <span className="opacity-50">…</span>}
      {segments.map((seg, i) => {
        const isFile = i === segments.length - 1;
        return (
          <span key={`${i}-${seg}`} className="flex items-center gap-1">
            {(i > 0 || truncated) && (
              <span className="select-none opacity-40">›</span>
            )}
            <span className={isFile ? "text-foreground/80" : "opacity-70"}>
              {seg}
            </span>
          </span>
        );
      })}
      {symbols.map((sym, i) => (
        <span
          key={`${sym.from}-${i}`}
          className="flex min-w-0 items-center gap-1"
        >
          <span className="select-none opacity-40">›</span>
          <span className="truncate text-foreground/70">{sym.name}</span>
        </span>
      ))}
    </div>
  );
});
