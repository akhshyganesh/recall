import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={cn(
        "rounded px-2 py-0.5 text-[10px] font-medium transition-all",
        copied
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        className,
      )}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="relative rounded-lg border border-border/40 bg-muted/40">
      {label && (
        <div className="flex items-center justify-between border-b border-border/30 px-3 py-1.5">
          <span className="font-mono text-[10px] text-muted-foreground/50">{label}</span>
          <CopyButton text={children} />
        </div>
      )}
      {!label && (
        <div className="absolute top-2 right-2">
          <CopyButton text={children} />
        </div>
      )}
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold text-foreground">{children}</h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11.5px] font-semibold text-foreground/80">{children}</h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11.5px] leading-relaxed text-muted-foreground/70">{children}</p>
  );
}

// ── Install tab ───────────────────────────────────────────────────────────────

const ZIP_STRUCTURE = `my-extension/
├── manifest.json
└── index.js`;

const MANIFEST_EXAMPLE = `{
  "id": "com.yourname.my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "What it does.",
  "entry": "index.js"
}`;

function InstallTab() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <H2>Install from GitHub</H2>
        <P>
          Point Recall at any public GitHub repository. The latest release must
          include one of these assets:
        </P>
        <ul className="flex flex-col gap-1 pl-1">
          {[
            ["recall-plugin.js", "Single-file JS extension (preferred)"],
            ["recall-plugin.zip", "ZIP bundle with manifest + entry file"],
            ["plugin.js / index.js", "Fallback JS filename"],
          ].map(([name, desc]) => (
            <li key={name} className="flex items-start gap-2 text-[11.5px]">
              <code className="mt-px shrink-0 rounded bg-muted px-1.5 py-px font-mono text-[10px] text-foreground/70">
                {name}
              </code>
              <span className="text-muted-foreground/60">{desc}</span>
            </li>
          ))}
        </ul>
        <P>
          Paste the repo URL (e.g.{" "}
          <code className="rounded bg-muted px-1 font-mono text-[10px]">
            https://github.com/owner/repo
          </code>
          ) into the "From GitHub" installer and click Install.
        </P>
      </div>

      <div className="flex flex-col gap-3">
        <H2>Install from ZIP</H2>
        <P>
          Build a ZIP file containing at minimum a{" "}
          <code className="rounded bg-muted px-1 font-mono text-[10px]">manifest.json</code> and the
          entry JS file:
        </P>
        <Code label="ZIP structure">{ZIP_STRUCTURE}</Code>
        <Code label="manifest.json">{MANIFEST_EXAMPLE}</Code>
        <P>
          Compress the folder and use "From ZIP" in the install section to load it.
        </P>
      </div>

      <div className="flex flex-col gap-3">
        <H2>Managing extensions</H2>
        <P>
          Toggle the switch next to any extension to enable or disable it without
          uninstalling. Built-in extensions can be disabled but not removed.
          Installed extensions can be removed entirely with the trash icon.
        </P>
      </div>
    </div>
  );
}

// ── Create tab — manual ───────────────────────────────────────────────────────

const EXTENSION_TEMPLATE = `// recall-plugin.js — minimal sidebar panel extension
const { useState } = React;

function MyPanel() {
  const [count, setCount] = useState(0);
  return (
    <div style={{ padding: 16, fontFamily: "monospace" }}>
      <p style={{ color: "var(--foreground)", fontSize: 12 }}>
        Clicked {count} times
      </p>
      <button
        onClick={() => setCount(c => c + 1)}
        style={{
          marginTop: 8,
          padding: "4px 12px",
          background: "var(--primary)",
          color: "var(--primary-foreground)",
          border: "none",
          borderRadius: 6,
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        Click me
      </button>
    </div>
  );
}

export default {
  id: "com.yourname.my-panel",
  name: "My Panel",
  version: "1.0.0",
  description: "A simple sidebar panel.",

  activate(api) {
    const unregister = api.registerSidebarPanel({
      label: "My Panel",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M9 9h6M9 12h6M9 15h4"/>
        </svg>
      ),
      render: () => <MyPanel />,
    });
    return unregister; // called when the extension is disabled
  },
};`;

const API_REFERENCE = `interface RecallAPI {
  // Sidebar panel shown in the left rail
  registerSidebarPanel(def: {
    id?: string;
    label: string;
    icon: ReactNode;       // 13×13 SVG recommended
    render: () => ReactNode;
  }): () => void;

  // Command palette entry
  registerCommand(id: string, def: {
    label: string;
    handler: () => void;
    keybinding?: string;
  }): () => void;

  // Extra tab in Settings
  registerSettingsSection(def: {
    id: string;
    label: string;
    icon: ReactNode;
    render: () => ReactNode;
  }): () => void;

  // Custom tab renderer
  registerTabRenderer(kind: string, def: {
    canHandle: (kind: string) => boolean;
    render: (props: { tabId: number; data: unknown }) => ReactNode;
  }): () => void;

  // Open files by extension in a custom tab
  registerFileHandler(def: {
    extensions: string[];   // e.g. ["*.canvas"]
    tabKind: string;
  }): () => void;
}`;

function ManualCreate() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <H2>Extension structure</H2>
        <P>
          An extension is a single <code className="rounded bg-muted px-1 font-mono text-[10px]">.js</code> file
          that exports a default object implementing <code className="rounded bg-muted px-1 font-mono text-[10px]">RecallExtension</code>.
          React is globally available — no imports needed.
        </P>
        <Code label="recall-plugin.js — starter template">{EXTENSION_TEMPLATE}</Code>
      </div>

      <div className="flex flex-col gap-3">
        <H2>Full API reference</H2>
        <Code label="RecallAPI">{API_REFERENCE}</Code>
      </div>

      <div className="flex flex-col gap-3">
        <H2>Tips</H2>
        <ul className="flex flex-col gap-2">
          {[
            "Use CSS variables (--primary, --foreground, --background, --border, --muted) so your UI respects the user's theme.",
            "Persist state with localStorage — use a namespaced key like \"com.yourname.ext.data\".",
            "The cleanup function returned from activate is called when the extension is disabled. Call all unregister functions inside it.",
            "Icons in the sidebar rail render at 13×13px. Inline SVG with stroke=\"currentColor\" works best.",
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-[11.5px] text-muted-foreground/70">
              <span className="mt-px shrink-0 text-primary/50">→</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Create tab — AI agent ─────────────────────────────────────────────────────

const EXTENSION_TYPES = [
  { id: "sidebar", label: "Sidebar panel", desc: "Appears in the left rail as a named panel." },
  { id: "command", label: "Command", desc: "Runs an action from a command palette entry." },
  { id: "settings", label: "Settings section", desc: "Adds a tab to the Settings dialog." },
  { id: "filehandler", label: "File handler", desc: "Opens specific file types in a custom tab." },
];

function buildPrompt(description: string, types: string[], extra: string): string {
  const typeLabels = EXTENSION_TYPES.filter((t) => types.includes(t.id))
    .map((t) => `- ${t.label}: ${t.desc}`)
    .join("\n");

  return `Create a Recall terminal app extension with the following requirements.

## What to build
${description || "(describe your extension here)"}

## Extension types needed
${typeLabels || "- Sidebar panel: Appears in the left rail as a named panel."}

${extra ? `## Additional notes\n${extra}\n` : ""}
## Extension API

The extension exports a default object:

\`\`\`ts
interface RecallExtension {
  id: string;          // reverse-domain, e.g. "com.yourname.my-ext"
  name: string;
  version: string;
  description?: string;
  activate(api: RecallAPI): (() => void) | void;
}
\`\`\`

RecallAPI (each method returns a cleanup \`() => void\`):

\`\`\`ts
api.registerSidebarPanel({ id?, label, icon: ReactNode, render: () => ReactNode })
api.registerCommand(id, { label, handler: () => void, keybinding? })
api.registerSettingsSection({ id, label, icon: ReactNode, render: () => ReactNode })
api.registerTabRenderer(kind, { canHandle: (kind) => boolean, render: ({ tabId, data }) => ReactNode })
api.registerFileHandler({ extensions: string[], tabKind: string })
\`\`\`

## Rules
- Single self-contained \`recall-plugin.js\` file, no imports
- React (with hooks) is available as the global \`React\`
- JSX syntax is supported
- Persist state with \`localStorage\` using a namespaced key
- Icons: inline SVG, 13×13px, \`stroke="currentColor"\`
- Styling: use inline styles with CSS variables (\`var(--primary)\`, \`var(--foreground)\`, \`var(--background)\`, \`var(--border)\`, \`var(--muted)\`, \`var(--muted-foreground)\`, \`var(--primary-foreground)\`) for theme compatibility. Tailwind classes are also available.
- The \`activate\` return value must be a cleanup function that calls all unregister functions
- Export: \`export default { id, name, version, description, activate }\`

## Output
Return only the complete \`recall-plugin.js\` file. No explanation, no markdown fences — just the raw JS code.`.trim();
}

function AIAgentCreate() {
  const [description, setDescription] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["sidebar"]);
  const [extra, setExtra] = useState("");
  const [prompt, setPrompt] = useState("");

  const toggleType = (id: string) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
    setPrompt("");
  };

  const generate = () => {
    setPrompt(buildPrompt(description, selectedTypes, extra));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <P>
          Fill in what you want your extension to do. Click <strong className="text-foreground/80">Generate prompt</strong>,
          then paste the result into Claude, ChatGPT, or any AI assistant.
          It will output a ready-to-install <code className="rounded bg-muted px-1 font-mono text-[10px]">recall-plugin.js</code> file.
        </P>
      </div>

      <div className="flex flex-col gap-1.5">
        <H3>What should your extension do?</H3>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); setPrompt(""); }}
          placeholder="e.g. Show a panel with a live clock and a world time zone picker…"
          rows={3}
          className={cn(
            "w-full resize-none rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5",
            "text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground/35",
            "focus:border-ring focus:ring-2 focus:ring-ring/15",
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <H3>Extension type</H3>
        <div className="grid grid-cols-2 gap-2">
          {EXTENSION_TYPES.map((t) => {
            const active = selectedTypes.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleType(t.id)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-primary/40 bg-primary/8 text-foreground"
                    : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/40",
                )}
              >
                <span className="text-[11.5px] font-semibold">{t.label}</span>
                <span className="text-[10.5px] leading-snug opacity-60">{t.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <H3>Additional requirements <span className="text-[10px] font-normal text-muted-foreground/50">(optional)</span></H3>
        <textarea
          value={extra}
          onChange={(e) => { setExtra(e.target.value); setPrompt(""); }}
          placeholder="e.g. Use a dark monospace font, persist data across restarts, show a badge count…"
          rows={2}
          className={cn(
            "w-full resize-none rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5",
            "text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground/35",
            "focus:border-ring focus:ring-2 focus:ring-ring/15",
          )}
        />
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={!description.trim()}
        className="flex h-9 items-center justify-center rounded-xl bg-primary text-[12px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
      >
        Generate prompt
      </button>

      {prompt && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <H3>Your AI prompt</H3>
            <CopyButton text={prompt} />
          </div>
          <textarea
            readOnly
            value={prompt}
            rows={10}
            className={cn(
              "w-full resize-none rounded-xl border border-border/40 bg-muted/30 px-3 py-2.5",
              "font-mono text-[10.5px] leading-relaxed text-foreground/70 outline-none",
            )}
          />
          <p className="text-[10.5px] text-muted-foreground/45">
            Copy this prompt → paste into Claude, ChatGPT, or any AI assistant →
            save the output as <code className="font-mono">recall-plugin.js</code> →
            install via "From ZIP" (wrap it in a ZIP with a manifest.json).
          </p>
        </div>
      )}
    </div>
  );
}

// ── Create tab (wrapper with Manual / AI toggle) ──────────────────────────────

function CreateTab() {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex rounded-xl border border-border/40 bg-muted/30 p-0.5">
        {(["ai", "manual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-[10px] py-1.5 text-[11.5px] font-medium transition-all",
              mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "ai" ? "AI Agent" : "Manual"}
          </button>
        ))}
      </div>
      {mode === "ai" ? <AIAgentCreate /> : <ManualCreate />}
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

type GuideTab = "install" | "create";

export function ExtensionGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<GuideTab>("install");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[680px] w-[680px] sm:max-w-[680px] flex-col gap-0 overflow-hidden rounded-xl border border-border/40 p-0"
      >
        <DialogTitle className="sr-only">Extension Guide</DialogTitle>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/30 px-5 py-3">
          <span className="text-[13px] font-semibold">Extension Guide</span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
          </button>
        </div>

        {/* Tab strip */}
        <div className="flex shrink-0 border-b border-border/30">
          {(["install", "create"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "relative px-5 py-2.5 text-[12px] font-medium capitalize transition-colors",
                tab === t ? "text-foreground" : "text-muted-foreground/60 hover:text-foreground",
              )}
            >
              {tab === t && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
              )}
              {t === "install" ? "Install" : "Create extension"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tab === "install" ? <InstallTab /> : <CreateTab />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
