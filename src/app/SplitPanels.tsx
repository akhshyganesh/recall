import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { EditorStack, GitDiffStack } from "@/modules/editor";
import { GitHistoryStack } from "@/modules/git-history";
import { MarkdownStack } from "@/modules/markdown";
import { MediaStack, PreviewStack } from "@/modules/preview";
import { SessionHistoryStack } from "@/modules/sessions";
import type { Tab } from "@/modules/tabs";
import { TerminalStack, type TerminalPaneHandle } from "@/modules/terminal";
import type { SearchAddon } from "@xterm/addon-search";
import type React from "react";

type SplitPaneHandlers = {
  registerTerminalHandle: (leafId: number, h: TerminalPaneHandle | null) => void;
  onSearchReady: (leafId: number, addon: SearchAddon) => void;
  onTerminalCwd: (leafId: number, cwd: string) => void;
  onLeafExit: (leafId: number, code: number) => void;
  onFocusLeaf: (tabId: number, leafId: number) => void;
  onOpenCommitFile: React.ComponentProps<typeof GitHistoryStack>["onOpenCommitFile"];
};

type Props = SplitPaneHandlers & {
  tabs: Tab[];
  rowSplitTabIds: number[];
  colSplitTabIds: number[];
  unsplitDraggingTabId: number | null;
  onUnsplitPointerDown: (e: React.PointerEvent, tabId: number) => void;
  onUnsplitPointerMove: (e: React.PointerEvent) => void;
  onUnsplitPointerUp: (e: React.PointerEvent) => void;
  removeSplitTab: (tabId: number) => void;
  children: React.ReactNode;
};

function SplitPaneContent({
  secTab,
  tabs,
  registerTerminalHandle,
  onSearchReady,
  onTerminalCwd,
  onLeafExit,
  onFocusLeaf,
  onOpenCommitFile,
}: SplitPaneHandlers & { secTab: Tab; tabs: Tab[] }) {
  if (secTab.kind === "terminal") {
    return (
      <div className="absolute inset-0">
        <TerminalStack
          tabs={[secTab]}
          activeId={secTab.id}
          registerHandle={registerTerminalHandle}
          onSearchReady={onSearchReady}
          onCwd={onTerminalCwd}
          onExit={onLeafExit}
          onFocusLeaf={onFocusLeaf}
        />
      </div>
    );
  }
  const isSecEditor = secTab.kind === "editor";
  const isSecPreview = secTab.kind === "preview";
  const isSecMarkdown = secTab.kind === "markdown";
  const isSecMedia = secTab.kind === "media";
  const isSecSession = secTab.kind === "session";
  const isSecGitDiff = secTab.kind === "git-diff" || secTab.kind === "git-commit-file";
  const isSecGitHistory = secTab.kind === "git-history";
  return (
    <div className="relative h-full min-h-0">
      <div className={cn("absolute inset-0", !isSecEditor && "invisible pointer-events-none")} aria-hidden={!isSecEditor}>
        <EditorStack tabs={tabs} activeId={secTab.id} registerHandle={() => {}} onDirtyChange={() => {}} onCloseTab={() => {}} />
      </div>
      <div className={cn("absolute inset-0", !isSecPreview && "invisible pointer-events-none")} aria-hidden={!isSecPreview}>
        <PreviewStack tabs={tabs} activeId={secTab.id} registerHandle={() => {}} onUrlChange={() => {}} />
      </div>
      <div className={cn("absolute inset-0", !isSecMarkdown && "invisible pointer-events-none")} aria-hidden={!isSecMarkdown}>
        <MarkdownStack tabs={tabs} activeId={secTab.id} />
      </div>
      <div className={cn("absolute inset-0", !isSecMedia && "invisible pointer-events-none")} aria-hidden={!isSecMedia}>
        <MediaStack tabs={tabs} activeId={secTab.id} />
      </div>
      <div className={cn("absolute inset-0", !isSecSession && "invisible pointer-events-none")} aria-hidden={!isSecSession}>
        <SessionHistoryStack tabs={tabs} activeId={secTab.id} />
      </div>
      <div className={cn("absolute inset-0", !isSecGitDiff && "invisible pointer-events-none")} aria-hidden={!isSecGitDiff}>
        <GitDiffStack tabs={tabs} activeId={secTab.id} />
      </div>
      <div className={cn("absolute inset-0", !isSecGitHistory && "invisible pointer-events-none")} aria-hidden={!isSecGitHistory}>
        <GitHistoryStack tabs={tabs} activeId={secTab.id} onOpenCommitFile={onOpenCommitFile} onSearchHandle={() => {}} />
      </div>
    </div>
  );
}

export function SplitPanels({
  tabs,
  rowSplitTabIds,
  colSplitTabIds,
  unsplitDraggingTabId,
  onUnsplitPointerDown,
  onUnsplitPointerMove,
  onUnsplitPointerUp,
  removeSplitTab,
  registerTerminalHandle,
  onSearchReady,
  onTerminalCwd,
  onLeafExit,
  onFocusLeaf,
  onOpenCommitFile,
  children,
}: Props) {
  const renderSplitPanel = (t: Tab) => (
    <div className="group/pane flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 select-none items-center gap-1 border-b border-border/40 bg-card/50 px-1.5">
        <div
          className={cn(
            "flex min-w-0 flex-1 cursor-grab items-center gap-1 active:cursor-grabbing",
            unsplitDraggingTabId === t.id && "opacity-40",
          )}
          onPointerDown={(e) => onUnsplitPointerDown(e, t.id)}
          onPointerMove={onUnsplitPointerMove}
          onPointerUp={onUnsplitPointerUp}
          onPointerCancel={onUnsplitPointerUp}
          title="Drag up to the tab bar to un-split"
        >
          <span className="shrink-0 text-[8px] leading-none text-muted-foreground/40">⠿</span>
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
            {t.title}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close pane"
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/pane:opacity-100"
          onClick={() => removeSplitTab(t.id)}
        >
          <svg width="9" height="9" viewBox="0 0 11 11" fill="none">
            <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <SplitPaneContent
          secTab={t}
          tabs={tabs}
          registerTerminalHandle={registerTerminalHandle}
          onSearchReady={onSearchReady}
          onTerminalCwd={onTerminalCwd}
          onLeafExit={onLeafExit}
          onFocusLeaf={onFocusLeaf}
          onOpenCommitFile={onOpenCommitFile}
        />
      </div>
    </div>
  );

  const rowSplitTabs = tabs.filter((t) => rowSplitTabIds.includes(t.id));
  const colSplitTabs = tabs.filter((t) => colSplitTabIds.includes(t.id));
  const hasRowSplits = rowSplitTabs.length > 0;
  const hasColSplits = colSplitTabs.length > 0;

  // Left column: primary workspace + any "below" (col) splits stacked vertically
  const leftColumnInner = hasColSplits ? (
    <ResizablePanelGroup
      key={`col-split-${colSplitTabs.length}`}
      orientation="vertical"
      className="min-h-0 flex-1 h-full"
    >
      <ResizablePanel
        id="workspace-primary"
        defaultSize={`${(100 / (colSplitTabs.length + 1)).toFixed(1)}%`}
        minSize="15%"
      >
        <div className="relative h-full min-h-0">{children}</div>
      </ResizablePanel>
      {colSplitTabs.flatMap((t) => [
        <ResizableHandle key={`col-handle-${t.id}`} />,
        <ResizablePanel
          key={`col-pane-${t.id}`}
          id={`workspace-col-${t.id}`}
          defaultSize={`${(100 / (colSplitTabs.length + 1)).toFixed(1)}%`}
          minSize="15%"
        >
          {renderSplitPanel(t)}
        </ResizablePanel>,
      ])}
    </ResizablePanelGroup>
  ) : (
    <div className="relative h-full min-h-0">{children}</div>
  );

  if (!hasRowSplits) {
    return <div className="min-h-0 flex-1">{leftColumnInner}</div>;
  }

  return (
    <ResizablePanelGroup
      key={`row-split-${rowSplitTabs.length}`}
      orientation="horizontal"
      className="min-h-0 flex-1"
    >
      <ResizablePanel
        id="workspace-left-col"
        defaultSize={`${(100 / (rowSplitTabs.length + 1)).toFixed(1)}%`}
        minSize="15%"
      >
        {leftColumnInner}
      </ResizablePanel>
      {rowSplitTabs.flatMap((t) => [
        <ResizableHandle key={`row-handle-${t.id}`} />,
        <ResizablePanel
          key={`row-pane-${t.id}`}
          id={`workspace-row-${t.id}`}
          defaultSize={`${(100 / (rowSplitTabs.length + 1)).toFixed(1)}%`}
          minSize="15%"
        >
          {renderSplitPanel(t)}
        </ResizablePanel>,
      ])}
    </ResizablePanelGroup>
  );
}
