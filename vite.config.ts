import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import path from "path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

// Builds every package under packages/ once before Vite starts.
// Adding a new extension package there is enough — no changes needed here.
function buildExtensionPackages(): Plugin {
  let built = false;
  return {
    name: "build-extension-packages",
    configResolved() {
      if (built) return;
      built = true;
      try {
        execSync("pnpm --filter './packages/*' build", {
          stdio: "inherit",
          cwd: __dirname,
        });
      } catch {
        // non-zero exit already printed to stderr — don't swallow it silently
      }
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  plugins: [buildExtensionPackages(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    drop: mode === "production" ? (["debugger"] as ["debugger"]) : [],
    pure:
      mode === "production"
        ? ["console.debug", "console.info", "console.trace"]
        : [],
  },
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome120" : "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        settings: path.resolve(__dirname, "settings.html"),
      },
      output: {
        manualChunks(id: string) {
          if (
            id.includes("modules/explorer/lib/fileIcons") ||
            id.includes("modules/explorer/lib/folderIcons") ||
            id.includes("@iconify-json/catppuccin")
          )
            return "file-icons";
          if (!id.includes("node_modules")) return;

          if (id.includes("/xterm/") || id.includes("@xterm/")) return "xterm";
          if (
            id.includes("@codemirror/") ||
            id.includes("@uiw/codemirror") ||
            id.includes("@replit/codemirror")
          )
            return "codemirror";
          if (id.includes("/streamdown/") || id.includes("@streamdown/"))
            return "streamdown";
          if (id.includes("/motion/") || id.includes("framer-motion"))
            return "motion";
          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/scheduler/")
          )
            return "react";
          if (id.includes("@radix-ui/") || id.includes("/radix-ui/"))
            return "radix";
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
