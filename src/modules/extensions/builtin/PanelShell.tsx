import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Cancel01Icon, Maximize01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
import {
  getExtensionScope,
  setExtensionScope,
  useWorkspacePath,
} from "../WorkspaceContext";

type Scope = "global" | "workspace";

interface Props {
  extensionId: string;
  title: string;
  children: ReactNode;
  /** Called when the scope changes so the panel can reload its storage. */
  onScopeChange?: (scope: Scope) => void;
}

export function PanelShell({ extensionId, title, children, onScopeChange }: Props) {
  const workspacePath = useWorkspacePath();
  const [scope, setScopeState] = useState<Scope>(() => getExtensionScope(extensionId));
  const [popout, setPopout] = useState(false);

  const cycleScope = () => {
    const next: Scope = scope === "global" ? "workspace" : "global";
    setExtensionScope(extensionId, next);
    setScopeState(next);
    onScopeChange?.(next);
  };

  const scopeDisabled = scope === "workspace" && !workspacePath;

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Panel header */}
        <div className="flex items-center border-b border-border/30 px-3 py-1.5 gap-2">
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/55">
            {title}
          </span>

          {/* Scope toggle */}
          <button
            type="button"
            onClick={cycleScope}
            title={scope === "global" ? "Global — click to switch to workspace scope" : `Workspace scope${!workspacePath ? " (no workspace active)" : ""}`}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider transition-colors",
              scope === "workspace" && workspacePath
                ? "bg-primary/12 text-primary"
                : scopeDisabled
                  ? "text-muted-foreground/30 cursor-default"
                  : "text-muted-foreground/40 hover:bg-muted/40 hover:text-muted-foreground",
            )}
          >
            {scope === "workspace" ? "workspace" : "global"}
          </button>

          {/* Pop-out button */}
          <button
            type="button"
            onClick={() => setPopout(true)}
            title="Open in floating window"
            className="rounded p-0.5 text-muted-foreground/35 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
          >
            <HugeiconsIcon icon={Maximize01Icon} size={11} strokeWidth={1.75} />
          </button>
        </div>

        {/* Panel body */}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>

      {/* Floating pop-out dialog */}
      <Dialog open={popout} onOpenChange={setPopout}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[520px] max-h-[80vh] w-[420px] sm:max-w-[420px] flex-col gap-0 overflow-hidden p-0"
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {/* Pop-out header — scope toggle + close */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border/30 px-3 py-1.5">
            <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/55">
              {title}
            </span>
            <button
              type="button"
              onClick={cycleScope}
              title={scope === "global" ? "Global — click to switch to workspace scope" : `Workspace scope${!workspacePath ? " (no workspace active)" : ""}`}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider transition-colors",
                scope === "workspace" && workspacePath
                  ? "bg-primary/12 text-primary"
                  : scopeDisabled
                    ? "text-muted-foreground/30 cursor-default"
                    : "text-muted-foreground/40 hover:bg-muted/40 hover:text-muted-foreground",
              )}
            >
              {scope === "workspace" ? "workspace" : "global"}
            </button>
            <button
              type="button"
              onClick={() => setPopout(false)}
              aria-label="Close"
              className="rounded p-0.5 text-muted-foreground/35 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
