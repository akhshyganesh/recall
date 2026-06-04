import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { copyToClipboard } from "@/modules/explorer/lib/contextActions";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setSessionsMcpEnabled as setSessionsMcpEnabledPref,
} from "@/modules/settings/store";
import {
  getSessionsMcpStatus,
  setSessionsMcpEnabled as applySessionsMcpEnabled,
  type SessionsMcpStatus,
} from "@/modules/sessions/api";
import {
  SESSIONS_MCP_ENDPOINT,
  SESSIONS_MCP_SETUP_STEPS,
  SESSIONS_MCP_SKILL_MARKDOWN,
} from "@/modules/sessions/mcpSkill";
import { Copy01Icon, Link01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState, type ReactNode } from "react";
import { SettingRow } from "../components/SettingRow";

type McpStatus = { running: boolean; endpoint: string };
type McpConnection = ReturnType<typeof useMcpConnection<McpStatus>>;
type CopyTarget = "sessions-endpoint" | "sessions-skill" | null;

export function SessionsMcpSection() {
  const sessionsMcpEnabled = usePreferencesStore((s) => s.sessionsMcpEnabled);
  const sessionsConnection = useMcpConnection<SessionsMcpStatus>({ getStatus: getSessionsMcpStatus, setEnabled: applySessionsMcpEnabled, setPreference: setSessionsMcpEnabledPref });
  const { copied, handleCopy } = useCopyFeedback();

  return (
    <div className="flex flex-col gap-4">
      <McpConnectionCard title="Session Connect" description="Expose indexed session history to local agents so they can inspect prior work, project context, and transcript history." enabled={sessionsMcpEnabled} connection={sessionsConnection} endpointFallback={SESSIONS_MCP_ENDPOINT} setupSteps={SESSIONS_MCP_SETUP_STEPS} skillMarkdown={SESSIONS_MCP_SKILL_MARKDOWN} endpointCopyTarget="sessions-endpoint" skillCopyTarget="sessions-skill" copied={copied} onCopy={handleCopy} />
    </div>
  );
}

function useCopyFeedback() {
  const [copied, setCopied] = useState<CopyTarget>(null);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async (target: Exclude<CopyTarget, null>, value: string) => {
    await copyToClipboard(value);
    setCopied(target);
  };

  return { copied, handleCopy };
}

function useMcpConnection<TStatus extends McpStatus>({ getStatus, setEnabled, setPreference }: { getStatus: () => Promise<TStatus>; setEnabled: (enabled: boolean) => Promise<TStatus>; setPreference: (enabled: boolean) => Promise<void> }) {
  const [status, setStatus] = useState<TStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getStatus()
      .then((nextStatus) => { if (alive) setStatus(nextStatus); })
      .catch((statusError) => { if (alive) setError(String(statusError)); });
    return () => { alive = false; };
  }, [getStatus]);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const nextStatus = await setEnabled(enabled);
      try {
        await setPreference(enabled);
        setStatus(nextStatus);
      } catch (preferenceError) {
        await setEnabled(!enabled).catch(() => undefined);
        throw preferenceError;
      }
    } catch (toggleError) {
      setError(String(toggleError));
      void getStatus().then((nextStatus) => setStatus(nextStatus)).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return { status, busy, error, toggle };
}

function McpConnectionCard({ title, description, enabled, connection, endpointFallback, setupSteps, skillMarkdown, endpointCopyTarget, skillCopyTarget, copied, onCopy, children }: { title: string; description: string; enabled: boolean; connection: McpConnection; endpointFallback: string; setupSteps: string[]; skillMarkdown: string; endpointCopyTarget: Exclude<CopyTarget, null>; skillCopyTarget: Exclude<CopyTarget, null>; copied: CopyTarget; onCopy: (target: Exclude<CopyTarget, null>, value: string) => Promise<void>; children?: ReactNode }) {
  const endpoint = connection.status?.endpoint ?? endpointFallback;

  return (
    <section className="rounded-sm border border-border/60 bg-card/45 p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
      </div>

      <SettingRow title={`Enable ${title}`} description={enabled ? `Running at ${endpoint}` : "Enable the local MCP endpoint while Recall is open."}>
        <Switch checked={enabled} disabled={connection.busy} onCheckedChange={(value) => void connection.toggle(value)} />
      </SettingRow>

      <div className="mt-3 rounded-sm border border-border/60 bg-background/65 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground">Endpoint</div>
            <div className="mt-1 break-all font-mono text-[11.5px] text-foreground/90">{endpoint}</div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-md" onClick={() => void onCopy(endpointCopyTarget, endpoint)}>
            <HugeiconsIcon icon={Link01Icon} size={12} strokeWidth={1.75} />
            {copied === endpointCopyTarget ? "Copied" : "Copy endpoint"}
          </Button>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          {connection.error ? <span className="text-destructive">{connection.error}</span> : enabled ? <span>MCP is available while Recall is running.</span> : <span>Enable the toggle above to start this MCP service.</span>}
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {setupSteps.map((step, index) => (
          <div key={step} className="rounded-sm border border-border/60 bg-background/65 px-3 py-3">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Step {index + 1}</div>
            <p className="mt-2 text-[12px] leading-relaxed text-foreground/90">{step}</p>
          </div>
        ))}
      </div>

      {children ? <div className="mt-4">{children}</div> : null}

      <div className="mt-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-medium tracking-tight text-muted-foreground">skills.md</span>
            <p className="mt-1 text-[11px] text-muted-foreground">Copy this into an agent that needs explicit MCP setup instructions.</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-md" onClick={() => void onCopy(skillCopyTarget, skillMarkdown)}>
            <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={1.75} />
            {copied === skillCopyTarget ? "Copied" : "Copy skills.md"}
          </Button>
        </div>
        <Textarea readOnly spellCheck={false} value={skillMarkdown} className="min-h-72 rounded-sm border border-border/60 bg-background/65 font-mono text-[11px] leading-5" />
      </div>
    </section>
  );
}