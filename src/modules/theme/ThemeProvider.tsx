import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  onPreferencesChange,
  setAccentHue as persistAccentHue,
  setTheme as persistTheme,
  type ThemePref,
} from "@/modules/settings/store";

export type Theme = ThemePref;

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  accentHue: number;
  setAccentHue: (hue: number) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

const FAST_PATH_KEY = "recall-ui-theme-shadow";
const FAST_HUE_KEY = "recall-ui-accent-hue-shadow";

function readFastTheme(fallback: Theme): Theme {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(FAST_PATH_KEY);
  return v === "dark" || v === "light" || v === "system" ? v : fallback;
}

function writeFastTheme(t: Theme): void {
  try { window.localStorage.setItem(FAST_PATH_KEY, t); } catch { /* ignore */ }
}

function readFastHue(): number {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES.accentHue;
  const v = window.localStorage.getItem(FAST_HUE_KEY);
  const n = v !== null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : DEFAULT_PREFERENCES.accentHue;
}

function writeFastHue(h: number): void {
  try { window.localStorage.setItem(FAST_HUE_KEY, String(h)); } catch { /* ignore */ }
}

function applyAccentHue(hue: number, isDark: boolean): void {
  const primary = isDark
    ? `oklch(0.76 0.16 ${hue})`
    : `oklch(0.58 0.18 ${hue})`;
  const root = document.documentElement;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--ring", primary);
  root.style.setProperty("--sidebar-primary", primary);
  root.style.setProperty("--sidebar-ring", primary);
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() =>
    readFastTheme(defaultTheme),
  );
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [accentHue, setAccentHueState] = useState<number>(() => readFastHue());

  // Hydrate from the persistent store (cross-window source of truth).
  useEffect(() => {
    let alive = true;
    void loadPreferences().then((p) => {
      if (!alive) return;
      setThemeState(p.theme);
      writeFastTheme(p.theme);
      setAccentHueState(p.accentHue);
      writeFastHue(p.accentHue);
    });
    const unlistenP = onPreferencesChange((key, value) => {
      if (key === "theme" && (value === "system" || value === "light" || value === "dark")) {
        setThemeState(value);
        writeFastTheme(value);
      }
      if (key === "accentHue" && typeof value === "number") {
        setAccentHueState(value);
        writeFastHue(value);
      }
    });
    return () => {
      alive = false;
      void unlistenP.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: "dark" | "light" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    applyAccentHue(accentHue, resolvedTheme === "dark");
  }, [accentHue, resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeFastTheme(next);
    void persistTheme(next);
  }, []);

  const setAccentHue = useCallback((hue: number) => {
    const normalized = Math.round(((hue % 360) + 360) % 360);
    setAccentHueState(normalized);
    writeFastHue(normalized);
    void persistAccentHue(normalized);
  }, []);

  const value = useMemo<ThemeProviderState>(
    () => ({ theme, resolvedTheme, setTheme, accentHue, setAccentHue }),
    [theme, resolvedTheme, setTheme, accentHue, setAccentHue],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderState {
  const ctx = useContext(ThemeProviderContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
