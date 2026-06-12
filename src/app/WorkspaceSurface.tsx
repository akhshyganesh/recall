import { cn } from "@/lib/utils";
import { EditorStack, GitDiffStack, type EditorPaneHandle } from "@/modules/editor";
import {
  GitHistoryStack,
  type GitHistorySearchHandle,
} from "@/modules/git-history";
import { MarkdownStack } from "@/modules/markdown";
import {
  MediaStack,
  PreviewStack,
  type PreviewPaneHandle,
} from "@/modules/preview";
import { SessionHistoryStack } from "@/modules/sessions";
import { findTabRenderer } from "@/modules/extensions/registry";
import type { ExtensionTab, Tab } from "@/modules/tabs";
import { TerminalStack, type TerminalPaneHandle } from "@/modules/terminal";
import type { SearchAddon } from "@xterm/addon-search";
import React from "react";

type Props = {
  tabs: Tab[];
  primaryTabs: Tab[];
  activeId: number;
  activeTab: Tab | undefined;
  registerTerminalHandle: (leafId: number, h: TerminalPaneHandle | null) => void;
  onSearchReady: (leafId: number, addon: SearchAddon) => void;
  onTerminalCwd: (leafId: number, cwd: string) => void;
  onLeafExit: (leafId: number, code: number) => void;
  onFocusLeaf: (tabId: number, leafId: number) => void;
  registerEditorHandle: (id: number, h: EditorPaneHandle | null) => void;
  onEditorDirty: (id: number, dirty: boolean) => void;
  onCloseTab: (id: number) => void;
  registerPreviewHandle: (id: number, h: PreviewPaneHandle | null) => void;
  onPreviewUrl: (id: number, url: string) => void;
  onOpenCommitFile: React.ComponentProps<typeof GitHistoryStack>["onOpenCommitFile"];
  onGitHistorySearchHandle: (h: GitHistorySearchHandle | null) => void;
};

export function WorkspaceSurface({
  tabs,
  primaryTabs,
  activeId,
  activeTab,
  registerTerminalHandle,
  onSearchReady,
  onTerminalCwd,
  onLeafExit,
  onFocusLeaf,
  registerEditorHandle,
  onEditorDirty,
  onCloseTab,
  registerPreviewHandle,
  onPreviewUrl,
  onOpenCommitFile,
  onGitHistorySearchHandle,
}: Props) {
  const isTerminalTab = activeTab?.kind === "terminal";
  const isEditorTab = activeTab?.kind === "editor";
  const isPreviewTab = activeTab?.kind === "preview";
  const isMarkdownTab = activeTab?.kind === "markdown";
  const isMediaTab = activeTab?.kind === "media";
  const isSessionTab = activeTab?.kind === "session";
  const isGitDiffTab =
    activeTab?.kind === "git-diff" || activeTab?.kind === "git-commit-file";
  const isGitHistoryTab = activeTab?.kind === "git-history";
  const isExtensionTab =
    !!activeTab &&
    !["terminal","editor","preview","markdown","media","session","git-diff","git-commit-file","git-history"].includes(activeTab.kind);

  return (
    <div className="relative h-full min-h-0">
      <div
        className={cn(
          "absolute inset-0",
          !isTerminalTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isTerminalTab}
      >
        <TerminalStack
          tabs={primaryTabs}
          activeId={activeId}
          registerHandle={registerTerminalHandle}
          onSearchReady={onSearchReady}
          onCwd={onTerminalCwd}
          onExit={onLeafExit}
          onFocusLeaf={onFocusLeaf}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isEditorTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isEditorTab}
      >
        <EditorStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerEditorHandle}
          onDirtyChange={onEditorDirty}
          onCloseTab={onCloseTab}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isPreviewTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isPreviewTab}
      >
        <PreviewStack
          tabs={tabs}
          activeId={activeId}
          registerHandle={registerPreviewHandle}
          onUrlChange={onPreviewUrl}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isMarkdownTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isMarkdownTab}
      >
        <MarkdownStack tabs={tabs} activeId={activeId} />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isMediaTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isMediaTab}
      >
        <MediaStack tabs={tabs} activeId={activeId} />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isSessionTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isSessionTab}
      >
        <SessionHistoryStack tabs={tabs} activeId={activeId} />
      </div>
      <div
        className={cn(
          "absolute inset-0 px-3 pt-2 pb-2",
          !isGitDiffTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isGitDiffTab}
      >
        <GitDiffStack tabs={tabs} activeId={activeId} />
      </div>
      <div
        className={cn(
          "absolute inset-0",
          !isGitHistoryTab && "invisible pointer-events-none",
        )}
        aria-hidden={!isGitHistoryTab}
      >
        <GitHistoryStack
          tabs={tabs}
          activeId={activeId}
          onOpenCommitFile={onOpenCommitFile}
          onSearchHandle={onGitHistorySearchHandle}
        />
      </div>
      {/* Extension tabs */}
      {isExtensionTab && activeTab && (() => {
        const renderer = findTabRenderer(activeTab.kind);
        if (!renderer) return (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            No renderer for {activeTab.kind}
          </div>
        );
        return (
          <div className="absolute inset-0">
            {renderer.render({ tabId: activeTab.id, data: (activeTab as ExtensionTab).data })}
          </div>
        );
      })()}
    </div>
  );
}
