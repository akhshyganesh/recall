import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setOpenRouterApiKey } from "@/modules/settings/store";
import { AiBrain01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { SettingRow } from "@/settings/components/SettingRow";

export function AiSection() {
  const savedKey = usePreferencesStore((s) => s.openRouterApiKey);
  const [draft, setDraft] = useState(savedKey);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setDraft(savedKey);
  }, [savedKey]);

  const handleSave = async () => {
    await setOpenRouterApiKey(draft);
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    const key = draft.trim();
    if (!key) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { "Authorization": `Bearer ${key}` },
      });
      if (res.ok) {
        setTestResult({ ok: true, message: "API key is valid" });
      } else {
        const body = await res.json().catch(() => ({}));
        setTestResult({ ok: false, message: body?.error?.message ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const isDirty = draft !== savedKey;
  const hasKey = savedKey.trim().length > 0;

  return (
    <div className="flex flex-col gap-4 pt-2">
      <section className="rounded-sm border border-border/60 bg-card/45 p-4">
        <div className="mb-4 flex items-start gap-3">
          <HugeiconsIcon icon={AiBrain01Icon} size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-primary/70" />
          <div>
            <h2 className="text-sm font-semibold tracking-tight">AI Assistant</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Power the AI chat panel and natural language shell command generation via OpenRouter — access Claude, GPT-4, and more with one key.
            </p>
          </div>
        </div>

        <SettingRow
          title="OpenRouter API Key"
          description={
            hasKey
              ? "API key is configured. Stored locally on your device."
              : "Required for AI chat and natural language commands."
          }
        >
          <div className="flex w-full max-w-72 flex-col gap-2">
            <div className="flex gap-2">
              <Input
                type="password"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setTestResult(null); }}
                placeholder="sk-or-…"
                className="h-8 flex-1 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                size="sm"
                variant={saved ? "default" : "outline"}
                onClick={() => void handleSave()}
                disabled={!isDirty || testing}
                className="h-8 shrink-0 gap-1 rounded-md"
              >
                {saved ? (
                  <>
                    <HugeiconsIcon icon={Tick01Icon} size={11} strokeWidth={2.5} />
                    Saved
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
            {draft.trim().length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleTest()}
                  disabled={testing || isDirty}
                  className="h-6 px-2 text-[10.5px] text-muted-foreground"
                >
                  {testing ? "Testing…" : "Test connection"}
                </Button>
                {testResult && (
                  <span
                    className={
                      testResult.ok
                        ? "text-[10.5px] text-green-500/80"
                        : "text-[10.5px] text-destructive/80"
                    }
                  >
                    {testResult.message}
                  </span>
                )}
              </div>
            )}
            {isDirty && draft.trim().length > 0 && (
              <p className="text-[10px] text-muted-foreground/60">Save your key first to test it.</p>
            )}
          </div>
        </SettingRow>

        <div className="mt-3 flex items-center gap-2 rounded-sm border border-border/40 bg-background/50 px-3 py-2.5">
          <div className="text-[11px] text-muted-foreground">
            Don&apos;t have an API key?{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              Get one at openrouter.ai/keys
            </a>
          </div>
        </div>
      </section>

      <section className="rounded-sm border border-border/60 bg-card/45 p-4">
        <h2 className="mb-1 text-sm font-semibold tracking-tight">Features</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          These features are enabled when an API key is configured.
        </p>
        <div className="flex flex-col gap-2">
          <FeatureRow
            title="AI Chat Panel"
            description="Session-aware assistant in the sidebar. Ask questions about your codebase, terminal commands, and past AI sessions."
            active={hasKey}
          />
          <FeatureRow
            title="Natural Language → Shell Command"
            description={`Press ${navigator.userAgent.includes("Mac") ? "⌘⇧K" : "Ctrl+Shift+K"} in any terminal tab to describe what you want to do and get a ready-to-run command.`}
            active={hasKey}
          />
        </div>
      </section>
    </div>
  );
}

function FeatureRow({ title, description, active }: { title: string; description: string; active: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-sm border border-border/40 bg-background/50 px-3 py-2.5">
      <div
        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${active ? "bg-green-500/70" : "bg-muted-foreground/30"}`}
      />
      <div>
        <div className="text-[11.5px] font-medium">{title}</div>
        <div className="mt-0.5 text-[10.5px] text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}
