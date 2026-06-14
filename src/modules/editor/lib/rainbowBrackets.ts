import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * Bracket pair colorization: colors (), [], {} by nesting depth, cycling
 * four theme-aware colors. Only the viewport is decorated; the nesting
 * depth at the viewport start is derived from a cheap plain-text prefix
 * scan (skipped for very large documents, where colors become
 * viewport-relative instead — visually indistinguishable in practice).
 */

const COLOR_COUNT = 4;
const OPEN = "([{";
const CLOSE = ")]}";
const BRACKETS = "()[]{}";
/** Above this size, skip the prefix scan and start at depth 0. */
const PREFIX_SCAN_LIMIT = 400_000;
/** Node names whose contents must not be treated as brackets. */
const SKIP_NODE_RE = /string|comment|template|regexp|char/i;

const marks = Array.from({ length: COLOR_COUNT }, (_, i) =>
  Decoration.mark({ class: `cm-rainbow-bracket-${i}` }),
);

// Low-saturation hues mixed with the theme foreground so they stay legible
// on both light and dark editor themes without hardcoding per-theme hex.
const bracketTheme = EditorView.baseTheme({
  ".cm-rainbow-bracket-0": {
    color: "color-mix(in oklab, var(--foreground) 35%, oklch(0.72 0.13 85)) !important",
  },
  ".cm-rainbow-bracket-1": {
    color: "color-mix(in oklab, var(--foreground) 35%, oklch(0.7 0.12 200)) !important",
  },
  ".cm-rainbow-bracket-2": {
    color: "color-mix(in oklab, var(--foreground) 35%, oklch(0.7 0.13 310)) !important",
  },
  ".cm-rainbow-bracket-3": {
    color: "color-mix(in oklab, var(--foreground) 35%, oklch(0.72 0.12 145)) !important",
  },
});

/** Plain-text bracket depth of `[0, end)` — no tree checks; used only to
 * seed the viewport scan with a stable absolute depth. */
function prefixDepth(view: EditorView, end: number): number {
  if (end <= 0) return 0;
  let depth = 0;
  for (const chunk of view.state.doc.iterRange(0, end)) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (OPEN.includes(ch)) depth++;
      else if (CLOSE.includes(ch) && depth > 0) depth--;
    }
  }
  return depth;
}

/** Ranges inside [from, to) that belong to strings/comments/regexps. */
function skipRanges(
  view: EditorView,
  from: number,
  to: number,
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  syntaxTree(view.state).iterate({
    from,
    to,
    enter(n) {
      if (SKIP_NODE_RE.test(n.name)) {
        ranges.push({ from: n.from, to: n.to });
        return false;
      }
      return undefined;
    },
  });
  return ranges;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const small = doc.length <= PREFIX_SCAN_LIMIT;
  let depth = 0;
  let scannedTo = -1;
  for (const range of view.visibleRanges) {
    if (scannedTo === -1) {
      depth = small ? prefixDepth(view, range.from) : 0;
    } else if (range.from > scannedTo && small) {
      // Carry depth across fold gaps with a plain scan of the gap.
      for (const chunk of doc.iterRange(scannedTo, range.from)) {
        for (let i = 0; i < chunk.length; i++) {
          const ch = chunk[i];
          if (OPEN.includes(ch)) depth++;
          else if (CLOSE.includes(ch) && depth > 0) depth--;
        }
      }
    }
    const skips = skipRanges(view, range.from, range.to);
    let skipIdx = 0;
    let pos = range.from;
    for (const chunk of doc.iterRange(range.from, range.to)) {
      for (let i = 0; i < chunk.length; i++, pos++) {
        const ch = chunk[i];
        if (!BRACKETS.includes(ch)) continue;
        while (skipIdx < skips.length && skips[skipIdx].to <= pos) skipIdx++;
        if (
          skipIdx < skips.length &&
          pos >= skips[skipIdx].from &&
          pos < skips[skipIdx].to
        )
          continue;
        if (OPEN.includes(ch)) {
          builder.add(pos, pos + 1, marks[depth % COLOR_COUNT]);
          depth++;
        } else {
          if (depth > 0) depth--;
          builder.add(pos, pos + 1, marks[depth % COLOR_COUNT]);
        }
      }
    }
    scannedTo = range.to;
  }
  return builder.finish();
}

const rainbowPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function rainbowBrackets(): Extension {
  return [bracketTheme, rainbowPlugin];
}
