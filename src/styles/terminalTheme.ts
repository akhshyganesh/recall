import { readAppTokens } from "@/styles/tokens";
import type { ITheme } from "@xterm/xterm";

/**
 * xterm.js ITheme is 18 colors: bg/fg/cursor/cursorAccent/selection + ANSI 16.
 *
 * Chrome colors (background, foreground, cursor, selection) come from shadcn's
 * globals.css tokens so the terminal visually fuses with the app. ANSI 16
 * stays curated — globals.css is grayscale, it has no semantic color palette.
 */

/** Curated ANSI 16 palette, tuned for shadcn's dark surface. */
const ansi = {
  black: "#111111",
  red: "#8a8a8a",
  green: "#6f6f6f",
  yellow: "#7a7a7a",
  blue: "#5f5f5f",
  magenta: "#737373",
  cyan: "#808080",
  white: "#e5e5e5",

  brightBlack: "#555555",
  brightRed: "#a3a3a3",
  brightGreen: "#9a9a9a",
  brightYellow: "#b0b0b0",
  brightBlue: "#c2c2c2",
  brightMagenta: "#adadad",
  brightCyan: "#bababa",
  brightWhite: "#f7f7f7",
} as const;

/** Semantic palette reused by the code editor. Kept in one place so the
 *  terminal's ANSI colors and syntax highlighting stay visually coherent. */
export const syntaxPalette = {
  comment: ansi.brightBlack,
  keyword: ansi.blue,
  string: ansi.green,
  number: ansi.yellow,
  constant: ansi.magenta,
  fn: ansi.cyan,
  type: ansi.brightCyan,
  tag: ansi.red,
  punctuation: "#a1a1aa",
  invalid: ansi.red,
  link: ansi.blue,
} as const;

/**
 * Builds an xterm theme at runtime from the current app tokens. Must be
 * called after the DOM is ready (after first paint); globals.css variables
 * are resolved via getComputedStyle.
 */
export function buildTerminalTheme(): ITheme {
  const t = readAppTokens();
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.foreground,
    cursorAccent: t.background,
    selectionBackground: t.accent,
    ...ansi,
  };
}
