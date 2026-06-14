import { useExtensionRegistry } from "@/modules/extensions";
import { WorkspaceContext } from "@/modules/extensions/WorkspaceContext";

export function ExtensionSidebarPanel({ viewId, workspacePath }: { viewId: string; workspacePath: string | null }) {
  const panel = useExtensionRegistry((s) => s.sidebarPanels.find((p) => p.id === viewId));
  if (!panel) return null;
  return (
    <WorkspaceContext.Provider value={{ workspacePath }}>
      {panel.render()}
    </WorkspaceContext.Provider>
  );
}
