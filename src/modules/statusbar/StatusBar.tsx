import { CwdBreadcrumb } from "./CwdBreadcrumb";
import { WorkspaceEnvSelector } from "./WorkspaceEnvSelector";
import type { WorkspaceEnv } from "@/modules/workspace";

type Props = {
  cwd: string | null;
  filePath?: string | null;
  home: string | null;
  onCd: (path: string) => void;
  onWorkspaceChange: (env: WorkspaceEnv) => void;
};

export function StatusBar({
  cwd,
  filePath,
  home,
  onCd,
  onWorkspaceChange,
}: Props) {
  return (
    <footer className="grid h-8 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/70 bg-background px-3 text-[11px]">
      <div className="shrink-0 rounded-sm border border-primary/45 bg-primary px-2 py-0.5 text-[10.5px] font-bold text-primary-foreground uppercase">
        Recall
      </div>
      <div className="flex min-w-0 items-center justify-center">
        <CwdBreadcrumb cwd={cwd} filePath={filePath} home={home} onCd={onCd} />
      </div>
      <div className="flex shrink-0 items-center justify-end">
        <WorkspaceEnvSelector onSelect={onWorkspaceChange} />
      </div>
    </footer>
  );
}
