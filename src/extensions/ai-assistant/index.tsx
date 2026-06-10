import { AiChatPanel } from "./AiChatPanel";
import { AiSection } from "./AiSection";
import { NlShellOverlayBackground } from "./NlShellOverlay";
import { AiBrain01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { RecallExtension } from "@/modules/extensions/types";
import { useWorkspacePath } from "@/modules/extensions/WorkspaceContext";

const EXT_ID = "recall.ai-assistant";

function AiChatPanelWrapper() {
  const workspacePath = useWorkspacePath();
  return <AiChatPanel workspacePath={workspacePath} repoRoot={null} />;
}

const AiIcon = ({ size = 12, strokeWidth = 1.75 }: { size?: number; strokeWidth?: number }) => (
  <HugeiconsIcon icon={AiBrain01Icon} size={size} strokeWidth={strokeWidth} />
);

export const aiAssistantExtension: RecallExtension = {
  id: EXT_ID,
  name: "AI Assistant",
  version: "1.0.0",
  description: "AI chat panel and natural language shell command generation via OpenRouter.",
  activate(api) {
    const cleanupPanel = api.registerSidebarPanel({
      id: "panel",
      label: "AI",
      icon: <AiIcon />,
      render: () => <AiChatPanelWrapper />,
    });
    const cleanupSettings = api.registerSettingsSection({
      id: "settings",
      label: "AI Assistant",
      icon: <AiIcon size={13} />,
      render: () => <AiSection />,
    });
    const cleanupBackground = api.registerBackground(
      "nl-overlay",
      () => <NlShellOverlayBackground />,
    );
    return () => {
      cleanupPanel();
      cleanupSettings();
      cleanupBackground();
    };
  },
};
