import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getPlannerDocument,
  savePlannerDocument,
  type PlannerDocument,
  type PlannerItem,
  type PlannerOption,
  type PlannerPriority,
  type PlannerSettings,
  type PlannerSketch,
  type PlannerStatus,
  type PlannerStatusOption,
  type PlannerTimerState,
} from "@/modules/planner/api";
import {
  consumePendingPlannerView,
  isPlannerView,
  PLANNER_VIEW_EVENT,
  type PlannerView,
} from "@/modules/planner/events";
import {
  CheckmarkCircle01Icon,
  Clock01Icon,
  Delete02Icon,
  GridViewIcon,
  LayoutTwoColumnIcon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  getSnapshot,
  loadSnapshot,
  Tldraw,
  type Editor,
  type TLEditorSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DEFAULT_STATUS_OPTIONS: PlannerStatusOption[] = [
  { id: "inbox", label: "Inbox", isDone: false },
  { id: "next", label: "Next", isDone: false },
  { id: "waiting", label: "Waiting", isDone: false },
  { id: "done", label: "Done", isDone: true },
];

const DEFAULT_PRIORITY_OPTIONS: PlannerOption[] = [
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
];

const DEFAULT_SETTINGS: PlannerSettings = {
  statuses: DEFAULT_STATUS_OPTIONS,
  priorities: DEFAULT_PRIORITY_OPTIONS,
  defaultStatusId: "inbox",
  doneStatusId: "done",
  defaultPriorityId: "normal",
};

const EMPTY_TIMER: PlannerTimerState = {
  totalSeconds: 0,
  runningSince: null,
  sessions: [],
};

const DEFAULT_SKETCH_ID = "default-sketch";
const MAX_RENDERED_LIST_ITEMS = 500;
const MAX_RENDERED_BOARD_ITEMS_PER_STAGE = 150;

export function PlannerApp() {
  const [document, setDocument] = useState<PlannerDocument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSketchId, setActiveSketchId] = useState<string | null>(null);
  const [view, setView] = useState<PlannerView>("list");
  const [query, setQuery] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftStartDate, setDraftStartDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const saveTimerRef = useRef(0);
  const draggingItemIdRef = useRef<string | null>(null);
  const dragFrameRef = useRef(0);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    let alive = true;
    void getPlannerDocument()
      .then((plannerDocument) => {
        if (!alive) return;
        const normalized = normalizeDocument(plannerDocument);
        setDocument(normalized);
        setSelectedId(normalized.items[0]?.id ?? null);
        setActiveSketchId(normalized.sketches[0]?.id ?? null);
        setError(null);
      })
      .catch((loadError) => {
        if (alive) setError(String(loadError));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const pending = consumePendingPlannerView();
    if (pending) setView(pending);
    const onPlannerView = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isPlannerView(detail)) setView(detail);
    };
    window.addEventListener(PLANNER_VIEW_EVENT, onPlannerView);
    return () => window.removeEventListener(PLANNER_VIEW_EVENT, onPlannerView);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (dragFrameRef.current) window.cancelAnimationFrame(dragFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (!document) return;
    if (activeSketchId && document.sketches.some((sketch) => sketch.id === activeSketchId)) return;
    setActiveSketchId(document.sketches[0]?.id ?? null);
  }, [activeSketchId, document]);

  const scheduleSave = useCallback((next: PlannerDocument) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = 0;
      void savePlannerDocument(next).catch((saveError) => setError(String(saveError)));
    }, 300);
  }, []);

  const commit = useCallback(
    (mutate: (current: PlannerDocument) => PlannerDocument) => {
      setDocument((current) => {
        if (!current) return current;
        const next = normalizeDocument(stampDocument(mutate(current)));
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const items = document?.items ?? [];
  const settings = document?.settings ?? DEFAULT_SETTINGS;
  const activeItems = useMemo(() => items.filter((item) => !item.archivedAt), [items]);
  const archivedItems = useMemo(() => items.filter((item) => !!item.archivedAt), [items]);
  const scopedItems = showArchived ? archivedItems : activeItems;
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const activeSketch = document?.sketches.find((sketch) => sketch.id === activeSketchId) ?? null;
  const filteredItems = useMemo(() => filterPlannerItems(scopedItems, deferredQuery), [deferredQuery, scopedItems]);

  const runningCount = activeItems.filter((item) => item.timer.runningSince).length;
  const totalTrackedSeconds = activeItems.reduce((sum, item) => sum + effectiveSeconds(item.timer, nowMs), 0);
  const dueCount = activeItems.filter((item) => !isDoneStatus(item.status, settings) && isDue(item.deadline)).length;
  const supportsArchiveToggle = view === "list" || view === "board";

  const selectItemAndOpenDetails = (id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);
  };

  useEffect(() => {
    if (!document) return;
    const selectedInScope = scopedItems.some((item) => item.id === selectedId);
    if (!selectedInScope) setSelectedId(scopedItems[0]?.id ?? null);
  }, [document, scopedItems, selectedId]);

  const addItem = () => {
    const title = draftTitle.trim();
    if (!title || !document) return;
    const duplicate = document.items.some((item) => item.title.trim().toLowerCase() === title.toLowerCase());
    if (duplicate) {
      setError("A planner item with that title already exists.");
      return;
    }
    const item = createItem({
      title,
      settings: document.settings,
      startDate: fromLocalInput(draftStartDate),
      tags: parseTags(draftTags),
    });
    commit((current) => ({ ...current, items: [item, ...current.items] }));
    setSelectedId(item.id);
    setDetailsOpen(true);
    setDraftTitle("");
    setDraftTags("");
    setDraftStartDate("");
    setCaptureOpen(false);
    setError(null);
  };

  const updateItem = (id: string, patch: Partial<PlannerItem>) => {
    commit((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item),
    }));
  };

  const toggleTimer = (item: PlannerItem) => {
    const endedAt = new Date().toISOString();
    if (!item.timer.runningSince) {
      updateItem(item.id, { timer: { ...item.timer, runningSince: endedAt } });
      return;
    }
    updateItem(item.id, { timer: stopTimer(item.timer, endedAt) });
  };

  const moveItem = (item: PlannerItem, status: PlannerStatus) => {
    const done = isDoneStatus(status, settings);
    const stoppedTimer = item.timer.runningSince ? stopTimer(item.timer, new Date().toISOString()) : item.timer;
    updateItem(item.id, {
      status,
      timer: done ? stoppedTimer : item.timer,
      completedAt: done ? new Date().toISOString() : null,
    });
  };

  const moveItemToStage = (itemId: string, status: PlannerStatus) => {
    commit((current) => {
      const item = current.items.find((candidate) => candidate.id === itemId);
      if (!item) return current;
      const done = isDoneStatus(status, current.settings);
      const updatedItem: PlannerItem = {
        ...item,
        status,
        timer: done && item.timer.runningSince ? stopTimer(item.timer, new Date().toISOString()) : item.timer,
        completedAt: done ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      };
      return { ...current, items: [updatedItem, ...current.items.filter((candidate) => candidate.id !== itemId)] };
    });
  };

  const beginBoardDrag = (id: string) => {
    draggingItemIdRef.current = id;
    if (dragFrameRef.current) window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = 0;
      setDraggingId(id);
    });
  };

  const endBoardDrag = () => {
    draggingItemIdRef.current = null;
    if (dragFrameRef.current) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = 0;
    }
    setDraggingId(null);
  };

  const dropBoardItem = (status: PlannerStatus, itemIdFromEvent?: string) => {
    const itemId = itemIdFromEvent || draggingItemIdRef.current || draggingId;
    if (!itemId) return;
    moveItemToStage(itemId, status);
    setSelectedId(itemId);
    endBoardDrag();
  };

  const deleteItem = (id: string) => {
    commit((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id),
      sketches: current.sketches.map((sketch) => sketch.linkedItemId === id ? { ...sketch, linkedItemId: null } : sketch),
    }));
    if (selectedId === id) setSelectedId(items.find((item) => item.id !== id)?.id ?? null);
  };

  const archiveItem = (item: PlannerItem) => {
    const archivedAt = new Date().toISOString();
    updateItem(item.id, {
      archivedAt,
      timer: item.timer.runningSince ? stopTimer(item.timer, archivedAt) : item.timer,
    });
  };

  const restoreItem = (id: string) => {
    updateItem(id, { archivedAt: null });
  };

  const updateSketchSnapshot = (id: string, snapshot: TLEditorSnapshot, shapeCount: number) => {
    commit((current) => withSketches(current, current.sketches.map((sketch) =>
      sketch.id === id ? { ...sketch, updatedAt: new Date().toISOString(), shapeCount, snapshot } : sketch,
    )));
  };

  const updateSketch = (id: string, patch: Partial<PlannerSketch>) => {
    commit((current) => withSketches(current, current.sketches.map((sketch) =>
      sketch.id === id ? { ...sketch, ...patch, updatedAt: new Date().toISOString() } : sketch,
    )));
  };

  const createSketch = (title: string, tags: string[], linkedItemId: string | null) => {
    const sketch = createSketchDocument(title, tags, linkedItemId);
    commit((current) => withSketches(current, [...current.sketches, sketch]));
    setActiveSketchId(sketch.id);
  };

  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-background">
        <div className="rounded-sm border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground shadow-none">Loading planner...</div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="grid h-full place-items-center bg-background px-6">
        <div className="max-w-md rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error ?? "Planner could not be loaded."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-sm border border-border/70 bg-background text-foreground shadow-none">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={2} />
            <h1 className="text-sm font-semibold tracking-tight">Planner</h1>
            <Badge variant="outline" className="rounded-sm text-[10px]">{runningCount} running</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>{activeItems.length} active</span>
            <span>{archivedItems.length} archived</span>
            <span>{formatDuration(totalTrackedSeconds)} tracked</span>
            <span>{dueCount} due</span>
            <span>{document.sketches.length} sketches</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, notes, tags" className="h-8 w-56 rounded-md bg-background/70 text-xs" />
          <Button size="sm" className="h-8 rounded-md px-2 text-xs" onClick={() => setCaptureOpen((open) => !open)}><HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />New Item</Button>
          {supportsArchiveToggle ? <div className="flex h-8 overflow-hidden rounded-md border border-border/60 bg-background/70 p-0.5">
            <button type="button" onClick={() => setShowArchived(false)} className={cn("rounded-sm px-2 text-xs", !showArchived ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>Active</button>
            <button type="button" onClick={() => setShowArchived(true)} className={cn("rounded-sm px-2 text-xs", showArchived ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>Archived</button>
          </div> : null}
          <ViewButton active={view === "list"} icon={GridViewIcon} label="Table" onClick={() => startTransition(() => setView("list"))} />
          <ViewButton active={view === "board"} icon={LayoutTwoColumnIcon} label="Board" onClick={() => startTransition(() => setView("board"))} />
          <ViewButton active={view === "sketch"} icon={PencilEdit02Icon} label="Sketch" onClick={() => startTransition(() => setView("sketch"))} />
        </div>
      </header>

      {error ? <div className="shrink-0 border-b border-destructive/25 bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</div> : null}

      <ResizablePanelGroup id="planner-layout" orientation="horizontal" className="min-h-0 flex-1" resizeTargetMinimumSize={{ fine: 24, coarse: 36 }}>
        <ResizablePanel id="planner-main" defaultSize="72%" minSize="42%">
        <section className="flex h-full min-w-0 flex-1 flex-col">
          {captureOpen ? <div className="grid shrink-0 gap-2 border-b border-border/50 bg-card/45 px-4 py-3 xl:grid-cols-[minmax(220px,1fr)_220px_220px_auto_auto]">
            <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addItem()} placeholder="Capture a task, reminder, or thing to think through" className="h-8 rounded-md bg-background/80 text-xs" />
            <Input value={draftTags} onChange={(event) => setDraftTags(event.target.value)} placeholder="Tags: writing, client" className="h-8 rounded-md bg-background/80 text-xs" />
            <Input type="datetime-local" value={draftStartDate} onChange={(event) => setDraftStartDate(event.target.value)} className="h-8 rounded-md bg-background/80 text-xs" title="Start date" />
            <Button size="sm" className="rounded-md" onClick={addItem}><HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />Add</Button>
            <Button variant="ghost" size="sm" className="rounded-md" onClick={() => setCaptureOpen(false)}>Cancel</Button>
          </div> : null}

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {view === "list" ? showArchived ? <ArchivePane items={filteredItems} settings={settings} selectedId={selectedId} onSelect={selectItemAndOpenDetails} onRestore={restoreItem} onDelete={deleteItem} /> : <PlannerTable items={filteredItems} settings={settings} selectedId={selectedId} nowMs={nowMs} onSelect={selectItemAndOpenDetails} onMove={moveItem} onToggleTimer={toggleTimer} /> : null}
            {view === "board" ? <PlannerBoard items={filteredItems} settings={settings} selectedId={selectedId} nowMs={nowMs} draggingId={draggingId} readOnly={showArchived} onDragStart={beginBoardDrag} onDragEnd={endBoardDrag} onDrop={dropBoardItem} onSelect={selectItemAndOpenDetails} onMove={moveItem} onToggleTimer={toggleTimer} /> : null}
            {view === "sketch" ? <SketchPane sketches={document.sketches} items={items} activeSketchId={activeSketch?.id ?? null} onActiveSketchChange={setActiveSketchId} onCreateSketch={createSketch} onSketchChange={updateSketch} onSnapshotChange={updateSketchSnapshot} /> : null}
          </div>
        </section>
        </ResizablePanel>
        {detailsOpen ? <ResizableHandle withHandle className="hidden lg:flex" /> : null}
        {detailsOpen ? <ResizablePanel id="planner-details" defaultSize="360px" minSize="280px" maxSize="560px" groupResizeBehavior="preserve-pixel-size" className="hidden lg:block">
          <aside className="flex h-full min-h-0 flex-col border-l border-border/60 bg-card/70">
            <ItemDetails item={selectedItem} settings={settings} nowMs={nowMs} onUpdate={updateItem} onMove={moveItem} onToggleTimer={toggleTimer} onArchive={archiveItem} onRestore={restoreItem} onDelete={deleteItem} onClose={() => setDetailsOpen(false)} />
          </aside>
        </ResizablePanel> : null}
      </ResizablePanelGroup>

    </div>
  );
}

function PlannerTable({ items, settings, selectedId, nowMs, onSelect, onMove, onToggleTimer }: { items: PlannerItem[]; settings: PlannerSettings; selectedId: string | null; nowMs: number; onSelect: (id: string) => void; onMove: (item: PlannerItem, status: PlannerStatus) => void; onToggleTimer: (item: PlannerItem) => void }) {
  if (items.length === 0) return <EmptyState title="No planner items match this view." />;
  const visibleItems = items.slice(0, MAX_RENDERED_LIST_ITEMS);
  const groups = groupPlannerItemsByDate(visibleItems, settings);
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <section key={group.id} className="overflow-hidden rounded-md border border-border/60 bg-card/80">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/55 px-3 py-2">
            <span className="text-xs font-semibold text-foreground">{group.title}</span>
            <span className="text-[11px] text-muted-foreground">{group.items.length}</span>
          </div>
          <div className="grid grid-cols-[minmax(220px,1.7fr)_140px_120px_120px_130px] border-b border-border/60 bg-muted/35 px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            <span>Item</span><span>Stage</span><span>Start</span><span>Deadline</span><span>Timer</span>
          </div>
          <div className="divide-y divide-border/50">
            {group.items.map((item) => (
              <div key={item.id} onClick={() => onSelect(item.id)} className={cn("grid cursor-pointer grid-cols-[minmax(220px,1.7fr)_140px_120px_120px_130px] items-center gap-2 px-3 py-3 text-left text-xs transition-colors hover:bg-muted/45", selectedId === item.id && "bg-muted/60")}>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{item.title}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <PriorityBadge priority={item.priority} settings={settings} />
                    {item.tags.slice(0, 3).map((tag) => <Badge key={tag} variant="outline" className="h-4 rounded-sm px-1.5 text-[10px]">{tag}</Badge>)}
                  </span>
                </span>
                <select value={item.status} onClick={(event) => event.stopPropagation()} onChange={(event) => onMove(item, event.target.value)} className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs outline-none">
                  {settings.statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
                </select>
                <span className="text-muted-foreground">{formatDate(item.startDate, "No start")}</span>
                <span className={cn("text-muted-foreground", isDue(item.deadline) && "text-destructive")}>{formatDate(item.deadline, "No deadline")}</span>
                <span className="flex items-center gap-2"><TimerButton item={item} nowMs={nowMs} onToggleTimer={onToggleTimer} />{item.timer.runningSince ? <span className="size-1.5 rounded-full bg-zinc-500" /> : null}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
      <RenderLimitNotice total={items.length} shown={visibleItems.length} />
    </div>
  );
}

function PlannerBoard({ items, settings, selectedId, nowMs, draggingId, readOnly, onDragStart, onDragEnd, onDrop, onSelect, onMove, onToggleTimer }: { items: PlannerItem[]; settings: PlannerSettings; selectedId: string | null; nowMs: number; draggingId: string | null; readOnly: boolean; onDragStart: (id: string) => void; onDragEnd: () => void; onDrop: (status: PlannerStatus, itemIdFromEvent?: string) => void; onSelect: (id: string) => void; onMove: (item: PlannerItem, status: PlannerStatus) => void; onToggleTimer: (item: PlannerItem) => void }) {
  return (
    <div className="grid min-h-full gap-3 xl:grid-cols-4 md:grid-cols-2">
      {settings.statuses.map((status) => {
        const statusItems = items.filter((item) => item.status === status.id);
        const visibleStatusItems = statusItems.slice(0, MAX_RENDERED_BOARD_ITEMS_PER_STAGE);
        return (
          <section key={status.id} onDragEnter={(event) => { if (readOnly) return; event.preventDefault(); }} onDragOver={(event) => { if (readOnly) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { if (readOnly) return; event.preventDefault(); event.stopPropagation(); const itemId = event.dataTransfer.getData("application/x-recall-planner-item") || event.dataTransfer.getData("text/plain"); onDrop(status.id, itemId || undefined); }} className={cn("flex min-h-0 flex-col rounded-md border border-border/60 bg-card/75 transition-colors", draggingId && "border-foreground/20 bg-card")}>
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2"><div className="flex items-center gap-2"><StatusBadge status={status.id} settings={settings} /><span className="text-xs text-muted-foreground">{statusItems.length}</span></div></div>
            <div className="flex min-h-55 flex-1 flex-col gap-2 p-2">
              {visibleStatusItems.map((item) => (
                <div key={item.id} role="button" tabIndex={0} draggable={!readOnly} onDragStart={(event) => { if (readOnly) return; event.stopPropagation(); event.dataTransfer.clearData(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-recall-planner-item", item.id); event.dataTransfer.setData("text/plain", item.id); onDragStart(item.id); }} onDragEnd={onDragEnd} onClick={() => onSelect(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(item.id); }} className={cn("rounded-md border border-border/60 bg-background/70 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/20", !readOnly && "cursor-grab active:cursor-grabbing", selectedId === item.id && "border-foreground/30 bg-background", draggingId === item.id && "opacity-50")}>
                  <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium leading-5">{item.title}</span><PriorityBadge priority={item.priority} settings={settings} /></div>
                  {item.notes ? <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{item.notes}</p> : null}
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{formatDate(item.startDate, "No start")}</span><TimerButton item={item} nowMs={nowMs} onToggleTimer={onToggleTimer} /></div>
                  {!readOnly ? <div className="mt-3 flex flex-wrap gap-1">
                    {settings.statuses.filter((target) => target.id !== item.status).slice(0, 3).map((target) => <Button key={target.id} variant="ghost" size="xs" className="h-6 rounded-sm px-2 text-[10px]" onClick={(event) => { event.stopPropagation(); onMove(item, target.id); }}>{target.label}</Button>)}
                  </div> : null}
                </div>
              ))}
              <RenderLimitNotice total={statusItems.length} shown={visibleStatusItems.length} />
              {statusItems.length === 0 ? <div className="grid flex-1 place-items-center rounded-md border border-dashed border-border/70 text-[11px] text-muted-foreground">Drop cards here</div> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ArchivePane({ items, settings, selectedId, onSelect, onRestore, onDelete }: { items: PlannerItem[]; settings: PlannerSettings; selectedId: string | null; onSelect: (id: string) => void; onRestore: (id: string) => void; onDelete: (id: string) => void }) {
  if (items.length === 0) return <EmptyState title="No archived planner items match this view." />;
  const visibleItems = items.slice(0, MAX_RENDERED_LIST_ITEMS);
  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-card/80">
      <div className="grid grid-cols-[minmax(220px,1.5fr)_130px_130px_160px] border-b border-border/60 bg-muted/50 px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        <span>Archived Item</span><span>Stage</span><span>Archived</span><span>Actions</span>
      </div>
      <div className="divide-y divide-border/50">
        {visibleItems.map((item) => (
          <div key={item.id} onClick={() => onSelect(item.id)} className={cn("grid cursor-pointer grid-cols-[minmax(220px,1.5fr)_130px_130px_160px] items-center gap-2 px-3 py-3 text-xs transition-colors hover:bg-muted/45", selectedId === item.id && "bg-muted/60")}>
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{item.title}</span>
              <span className="mt-1 flex flex-wrap gap-1">
                <PriorityBadge priority={item.priority} settings={settings} />
                {item.tags.slice(0, 3).map((tag) => <Badge key={tag} variant="outline" className="h-4 rounded-sm px-1.5 text-[10px]">{tag}</Badge>)}
              </span>
            </span>
            <StatusBadge status={item.status} settings={settings} />
            <span className="text-muted-foreground">{formatDate(item.archivedAt, "Archived")}</span>
            <span className="flex items-center gap-2">
              <Button variant="outline" size="xs" className="h-7 rounded-md px-2 text-[10px]" onClick={(event) => { event.stopPropagation(); onRestore(item.id); }}>Restore</Button>
              <Button variant="ghost" size="icon-sm" className="rounded-md text-destructive" onClick={(event) => { event.stopPropagation(); onDelete(item.id); }} title="Delete archived item">
                <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.75} />
              </Button>
            </span>
          </div>
        ))}
      </div>
      <RenderLimitNotice total={items.length} shown={visibleItems.length} />
    </div>
  );
}

function SketchPane({ sketches, items, activeSketchId, onActiveSketchChange, onCreateSketch, onSketchChange, onSnapshotChange }: { sketches: PlannerSketch[]; items: PlannerItem[]; activeSketchId: string | null; onActiveSketchChange: (id: string) => void; onCreateSketch: (title: string, tags: string[], linkedItemId: string | null) => void; onSketchChange: (id: string, patch: Partial<PlannerSketch>) => void; onSnapshotChange: (id: string, snapshot: TLEditorSnapshot, shapeCount: number) => void }) {
  const [newSketchTitle, setNewSketchTitle] = useState("");
  const [newSketchTags, setNewSketchTags] = useState("");
  const [newSketchLinkedItemId, setNewSketchLinkedItemId] = useState("");
  const [sketchQuery, setSketchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [linkedItemFilter, setLinkedItemFilter] = useState("");
  const [sketchSidebarOpen, setSketchSidebarOpen] = useState(true);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const tagOptions = useMemo(() => [...new Set(sketches.flatMap((sketch) => sketch.tags))].sort((a, b) => a.localeCompare(b)), [sketches]);
  const linkedItemOptions = useMemo(() => {
    const linkedIds = new Set(sketches.map((sketch) => sketch.linkedItemId).filter(Boolean));
    return items.filter((item) => linkedIds.has(item.id));
  }, [items, sketches]);
  const normalizedSketchQuery = sketchQuery.trim().toLowerCase();
  const filteredSketches = useMemo(() => sketches.filter((sketch) => {
    const linkedItemTitle = sketch.linkedItemId ? itemById.get(sketch.linkedItemId)?.title ?? "" : "";
    const searchableText = [sketch.title, sketch.tags.join(" "), linkedItemTitle].join(" ").toLowerCase();
    const matchesQuery = !normalizedSketchQuery || searchableText.includes(normalizedSketchQuery);
    const matchesTag = !tagFilter || sketch.tags.includes(tagFilter);
    const matchesLinkedItem = !linkedItemFilter || sketch.linkedItemId === linkedItemFilter;
    return matchesQuery && matchesTag && matchesLinkedItem;
  }), [itemById, linkedItemFilter, normalizedSketchQuery, sketches, tagFilter]);
  const activeSketch = sketches.find((sketch) => sketch.id === activeSketchId) ?? sketches[0] ?? null;

  const submitNewSketch = () => {
    const title = newSketchTitle.trim();
    if (!title) return;
    onCreateSketch(title, parseTags(newSketchTags), newSketchLinkedItemId || null);
    setNewSketchTitle("");
    setNewSketchTags("");
    setNewSketchLinkedItemId("");
  };

  return (
    <div className="h-full min-h-0">
      <ResizablePanelGroup id="planner-sketch-layout" orientation="horizontal" className="min-h-0" resizeTargetMinimumSize={{ fine: 24, coarse: 36 }}>
        {sketchSidebarOpen ? <>
          <ResizablePanel id="planner-sketch-sidebar" defaultSize="320px" minSize="260px" maxSize="480px" groupResizeBehavior="preserve-pixel-size" className="min-w-0">
            <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border/60 bg-card/85">
              <div className="border-b border-border/60 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold tracking-tight">New Sketch</h2>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-sm text-[10px]">{sketches.length}</Badge>
                    <Button variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs" onClick={() => setSketchSidebarOpen(false)}>Hide</Button>
                  </div>
                </div>
                <Field label="Name"><Input value={newSketchTitle} onChange={(event) => setNewSketchTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitNewSketch(); }} placeholder="Sketch name" className="h-8 rounded-md bg-background text-xs" /></Field>
                <Field label="Tags" className="mt-3"><Input value={newSketchTags} onChange={(event) => setNewSketchTags(event.target.value)} placeholder="flow, client, wireframe" className="h-8 rounded-md bg-background text-xs" /></Field>
                <Field label="Linked Planner" className="mt-3"><select value={newSketchLinkedItemId} onChange={(event) => setNewSketchLinkedItemId(event.target.value)} className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs outline-none"><option value="">No linked planner</option>{items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
                <Button size="sm" className="mt-4 w-full rounded-md" onClick={submitNewSketch} disabled={!newSketchTitle.trim()}><HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />Create Sketch</Button>
              </div>
              <div className="grid gap-2 border-b border-border/60 p-3">
                <Input value={sketchQuery} onChange={(event) => setSketchQuery(event.target.value)} placeholder="Search names, tags, linked planners" className="h-8 rounded-md bg-background text-xs" />
                <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs outline-none"><option value="">All tags</option>{tagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select>
                <select value={linkedItemFilter} onChange={(event) => setLinkedItemFilter(event.target.value)} className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs outline-none"><option value="">All linked planners</option>{linkedItemOptions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
                <Button variant="ghost" size="sm" className="h-8 rounded-md px-2 text-xs" onClick={() => { setSketchQuery(""); setTagFilter(""); setLinkedItemFilter(""); }}>Clear</Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {filteredSketches.length === 0 ? <EmptyState title="No sketches match those filters." /> : <div className="grid gap-2">
                  {filteredSketches.map((sketch) => {
                    const linkedItem = sketch.linkedItemId ? itemById.get(sketch.linkedItemId) ?? null : null;
                    return (
                      <button key={sketch.id} type="button" onClick={() => onActiveSketchChange(sketch.id)} className={cn("rounded-md border border-border/60 bg-background/70 p-3 text-left transition hover:border-foreground/20", activeSketch?.id === sketch.id && "border-foreground/30 bg-background")}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">{sketch.title}</span>
                          <Badge variant={linkedItem ? "secondary" : "outline"} className="max-w-full truncate rounded-sm text-[10px]">{linkedItem?.title ?? "No linked planner"}</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {sketch.tags.length > 0 ? sketch.tags.map((tag) => <Badge key={tag} variant="outline" className="h-4 rounded-sm px-1.5 text-[10px]">{tag}</Badge>) : <span className="text-[11px] text-muted-foreground">No tags</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>}
              </div>
            </section>
          </ResizablePanel>
          <ResizableHandle withHandle className="mx-2" />
        </> : null}

        <ResizablePanel id="planner-sketch-board" defaultSize={sketchSidebarOpen ? "70%" : "100%"} minSize="40%" className="min-w-0">
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border/60 bg-card/85">
            {activeSketch ? <>
              <div className="grid shrink-0 gap-2 border-b border-border/60 p-3 xl:grid-cols-[auto_minmax(180px,1fr)_220px_minmax(180px,0.8fr)]">
                {!sketchSidebarOpen ? <Button variant="outline" size="sm" className="h-8 rounded-md px-2 text-xs" onClick={() => setSketchSidebarOpen(true)}><HugeiconsIcon icon={LayoutTwoColumnIcon} size={13} strokeWidth={1.75} />Sketches</Button> : null}
                <Input value={activeSketch.title} onChange={(event) => onSketchChange(activeSketch.id, { title: event.target.value })} className="h-8 rounded-md bg-background text-xs font-medium" />
                <select value={activeSketch.linkedItemId ?? ""} onChange={(event) => onSketchChange(activeSketch.id, { linkedItemId: event.target.value || null })} className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs outline-none"><option value="">No linked planner</option>{items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
                <Input value={activeSketch.tags.join(", ")} onChange={(event) => onSketchChange(activeSketch.id, { tags: parseTags(event.target.value) })} placeholder="Tags" className="h-8 rounded-md bg-background text-xs" />
              </div>
              <div className="relative min-h-0 flex-1 bg-background"><SketchCanvas sketch={activeSketch} onSnapshotChange={onSnapshotChange} /></div>
            </> : <EmptyState title="Create a sketch to start a whiteboard." />}
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function SketchCanvas({ sketch, onSnapshotChange }: { sketch: PlannerSketch; onSnapshotChange: (id: string, snapshot: TLEditorSnapshot, shapeCount: number) => void }) {
  const saveTimerRef = useRef(0);
  useEffect(() => () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); }, []);
  const onMount = useCallback((editor: Editor) => {
    if (sketch.snapshot) {
      try { loadSnapshot(editor.store, sketch.snapshot as TLEditorSnapshot); } catch (loadError) { console.warn("planner sketch snapshot could not be loaded", loadError); }
    }
    editor.on("change", (entry) => {
      if (entry.source !== "user") return;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => { saveTimerRef.current = 0; onSnapshotChange(sketch.id, getSnapshot(editor.store), editor.getCurrentPageShapes().length); }, 500);
    });
  }, [onSnapshotChange, sketch.id, sketch.snapshot]);
  return <Tldraw key={sketch.id} persistenceKey={`recall-planner-sketch-${sketch.id}`} onMount={onMount} />;
}

function ItemDetails({ item, settings, nowMs, onUpdate, onMove, onToggleTimer, onArchive, onRestore, onDelete, onClose }: { item: PlannerItem | null; settings: PlannerSettings; nowMs: number; onUpdate: (id: string, patch: Partial<PlannerItem>) => void; onMove: (item: PlannerItem, status: PlannerStatus) => void; onToggleTimer: (item: PlannerItem) => void; onArchive: (item: PlannerItem) => void; onRestore: (id: string) => void; onDelete: (id: string) => void; onClose: () => void }) {
  if (!item) return <EmptyState title="Select an item to add notes, dates, and time." />;
  return <div className="flex min-h-0 flex-1 flex-col"><div className="shrink-0 border-b border-border/60 px-4 py-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold tracking-tight">Details</span><Button variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs" onClick={onClose}>Close</Button></div><Textarea value={item.title} onChange={(event) => onUpdate(item.id, { title: event.target.value })} className="min-h-18 rounded-md bg-background/80 text-sm font-semibold leading-5" /><div className="mt-3 flex flex-wrap items-center gap-2"><TimerButton item={item} nowMs={nowMs} onToggleTimer={onToggleTimer} expanded /><Button variant="outline" size="sm" className="rounded-md" onClick={() => onMove(item, isDoneStatus(item.status, settings) ? settings.defaultStatusId : settings.doneStatusId)}><HugeiconsIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={1.75} />{isDoneStatus(item.status, settings) ? "Reopen" : "Done"}</Button>{item.archivedAt ? <Button variant="outline" size="sm" className="rounded-md" onClick={() => onRestore(item.id)}>Restore</Button> : <Button variant="outline" size="sm" className="rounded-md" onClick={() => onArchive(item)}>Archive</Button>}</div>{item.archivedAt ? <div className="mt-2 rounded-md border border-border/60 bg-muted/45 px-3 py-2 text-[11px] text-muted-foreground">Archived {formatDate(item.archivedAt, "")}</div> : null}</div><div className="min-h-0 flex-1 overflow-auto px-4 py-4"><div className="grid grid-cols-2 gap-3"><Field label="Stage"><select value={item.status} onChange={(event) => onMove(item, event.target.value)} className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs outline-none">{settings.statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></Field><Field label="Priority"><select value={item.priority} onChange={(event) => onUpdate(item.id, { priority: event.target.value })} className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs outline-none">{settings.priorities.map((priority) => <option key={priority.id} value={priority.id}>{priority.label}</option>)}</select></Field><Field label="Start"><Input type="datetime-local" value={toLocalInput(item.startDate)} onChange={(event) => onUpdate(item.id, { startDate: fromLocalInput(event.target.value) })} className="h-8 rounded-md bg-background text-xs" /></Field><Field label="Deadline"><Input type="datetime-local" value={toLocalInput(item.deadline)} onChange={(event) => onUpdate(item.id, { deadline: fromLocalInput(event.target.value) })} className="h-8 rounded-md bg-background text-xs" /></Field><Field label="Estimate"><Input type="number" min={0} value={item.estimateMinutes ?? ""} onChange={(event) => onUpdate(item.id, { estimateMinutes: parseNullableNumber(event.target.value) })} className="h-8 rounded-md bg-background text-xs" placeholder="minutes" /></Field></div><Field label="Tags" className="mt-4"><Input value={item.tags.join(", ")} onChange={(event) => onUpdate(item.id, { tags: parseTags(event.target.value) })} className="h-8 rounded-md bg-background text-xs" placeholder="client, writing, blocked" /></Field><Field label="Notes" className="mt-4"><Textarea value={item.notes} onChange={(event) => onUpdate(item.id, { notes: event.target.value })} className="min-h-45 rounded-md bg-background text-sm leading-5" placeholder="Add context, acceptance criteria, links, or reminders." /></Field><div className="mt-5 rounded-md border border-border/60 bg-background/70 p-3"><div className="flex items-center justify-between gap-2"><div><div className="text-xs font-medium">Time Ledger</div><div className="mt-1 text-[11px] text-muted-foreground">{formatDuration(effectiveSeconds(item.timer, nowMs))} total</div></div><HugeiconsIcon icon={Clock01Icon} size={15} strokeWidth={1.75} className="text-muted-foreground" /></div><div className="mt-3 space-y-2">{item.timer.sessions.length === 0 ? <div className="text-[11px] text-muted-foreground">No completed timer sessions yet.</div> : item.timer.sessions.slice(0, 6).map((session) => <div key={`${session.startedAt}-${session.endedAt}`} className="flex items-center justify-between gap-3 text-[11px]"><span className="truncate text-muted-foreground">{formatRelative(session.startedAt)}</span><span className="font-mono text-foreground/80">{formatDuration(session.seconds)}</span></div>)}</div></div></div><div className="shrink-0 border-t border-border/60 px-4 py-3"><Button variant="destructive" size="sm" className="w-full rounded-md" onClick={() => onDelete(item.id)}>Delete Item</Button></div></div>;
}

function TimerButton({ item, nowMs, onToggleTimer, expanded }: { item: PlannerItem; nowMs: number; onToggleTimer: (item: PlannerItem) => void; expanded?: boolean }) {
  const running = !!item.timer.runningSince;
  return <Button variant={running ? "default" : "outline"} size={expanded ? "sm" : "xs"} className={cn("rounded-md font-mono", expanded ? "min-w-36" : "h-6 px-2 text-[10px]")} onClick={(event) => { event.stopPropagation(); onToggleTimer(item); }}><HugeiconsIcon icon={Clock01Icon} size={12} strokeWidth={2} />{running ? "Stop" : "Start"} {formatDuration(effectiveSeconds(item.timer, nowMs))}</Button>;
}

function ViewButton({ active, icon, label, onClick }: { active: boolean; icon: Parameters<typeof HugeiconsIcon>[0]["icon"]; label: string; onClick: () => void }) {
  return <Button variant={active ? "secondary" : "ghost"} size="sm" className="h-8 rounded-md px-2 text-xs" onClick={onClick}><HugeiconsIcon icon={icon} size={13} strokeWidth={active ? 2 : 1.75} />{label}</Button>;
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={cn("block", className)}><span className="mb-1.5 block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</span>{children}</label>;
}

function RenderLimitNotice({ total, shown }: { total: number; shown: number }) {
  if (total <= shown) return null;
  return <div className="border-t border-border/50 bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">Showing first {shown} of {total}. Use search to narrow the list.</div>;
}

function EmptyState({ title }: { title: string }) {
  return <div className="grid min-h-65 place-items-center rounded-md border border-dashed border-border/70 bg-card/55 p-6 text-center text-sm text-muted-foreground">{title}</div>;
}

function StatusBadge({ status, settings }: { status: PlannerStatus; settings: PlannerSettings }) {
  const option = settings.statuses.find((candidate) => candidate.id === status);
  return <Badge variant={isDoneStatus(status, settings) ? "secondary" : "outline"} className="h-5 rounded-sm px-2 text-[10px]">{option?.label ?? status}</Badge>;
}

function PriorityBadge({ priority, settings }: { priority: PlannerPriority; settings: PlannerSettings }) {
  const option = settings.priorities.find((candidate) => candidate.id === priority);
  const high = priority === "high" || option?.label.toLowerCase() === "high";
  const low = priority === "low" || option?.label.toLowerCase() === "low";
  return <Badge variant={high ? "destructive" : low ? "secondary" : "outline"} className="h-4 rounded-sm px-1.5 text-[10px]">{option?.label ?? priority}</Badge>;
}

function filterPlannerItems(items: PlannerItem[], query: string): PlannerItem[] {
  if (!query) return items;
  return items.filter((item) => {
    const haystack = [
      item.title,
      item.notes,
      item.status,
      item.priority,
      item.startDate ?? "",
      item.deadline ?? "",
      item.archivedAt ?? "",
      item.tags.join(" "),
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function groupPlannerItemsByDate(items: PlannerItem[], settings: PlannerSettings): Array<{ id: string; title: string; items: PlannerItem[] }> {
  const today = startOfLocalDay(new Date());
  const tomorrow = addDays(today, 1);
  const afterTomorrow = addDays(today, 2);
  const nextWeek = addDays(today, 7);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const groups = [
    { id: "overdue", title: "Overdue", items: [] as PlannerItem[] },
    { id: "today", title: "Today", items: [] as PlannerItem[] },
    { id: "tomorrow", title: "Tomorrow", items: [] as PlannerItem[] },
    { id: "this-week", title: "This Week", items: [] as PlannerItem[] },
    { id: "this-month", title: "This Month", items: [] as PlannerItem[] },
    { id: "later", title: "Later", items: [] as PlannerItem[] },
    { id: "unscheduled", title: "No Date", items: [] as PlannerItem[] },
  ];
  const byId = new Map(groups.map((group) => [group.id, group]));

  for (const item of items) {
    const plannedAt = Date.parse(item.startDate ?? item.deadline ?? "");
    if (!Number.isFinite(plannedAt)) {
      byId.get("unscheduled")?.items.push(item);
    } else if (plannedAt < today.getTime() && !isDoneStatus(item.status, settings)) {
      byId.get("overdue")?.items.push(item);
    } else if (plannedAt < tomorrow.getTime()) {
      byId.get("today")?.items.push(item);
    } else if (plannedAt < afterTomorrow.getTime()) {
      byId.get("tomorrow")?.items.push(item);
    } else if (plannedAt < nextWeek.getTime()) {
      byId.get("this-week")?.items.push(item);
    } else if (plannedAt < nextMonth.getTime()) {
      byId.get("this-month")?.items.push(item);
    } else {
      byId.get("later")?.items.push(item);
    }
  }

  return groups.filter((group) => group.items.length > 0);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeDocument(input: Partial<PlannerDocument>): PlannerDocument {
  const items = (input.items ?? []).map((item) => normalizeItem(item, input.settings));
  const settings = normalizeSettings(input.settings, items);
  const legacySketch = normalizeSketch(input.sketch, DEFAULT_SKETCH_ID);
  const sketches = (input.sketches && input.sketches.length > 0 ? input.sketches : [legacySketch]).map((sketch, index) => normalizeSketch(sketch, index === 0 ? DEFAULT_SKETCH_ID : undefined));
  return {
    schemaVersion: 1,
    updatedAt: input.updatedAt || new Date().toISOString(),
    items: items.map((item) => ({ ...item, status: settings.statuses.some((status) => status.id === item.status) ? item.status : settings.defaultStatusId, priority: settings.priorities.some((priority) => priority.id === item.priority) ? item.priority : settings.defaultPriorityId })),
    sketch: sketches[0] ?? legacySketch,
    sketches,
    settings,
    accessPolicy: { exposeItems: input.accessPolicy?.exposeItems ?? true, exposeNotes: input.accessPolicy?.exposeNotes ?? false, exposeTimers: input.accessPolicy?.exposeTimers ?? true, exposeSketches: input.accessPolicy?.exposeSketches ?? false, includeCompleted: input.accessPolicy?.includeCompleted ?? false },
  };
}

function normalizeItem(item: Partial<PlannerItem>, settings?: PlannerSettings): PlannerItem {
  const now = new Date().toISOString();
  return { id: item.id || uniqueId("item"), title: item.title || "Untitled item", status: item.status || settings?.defaultStatusId || DEFAULT_SETTINGS.defaultStatusId, priority: item.priority || settings?.defaultPriorityId || DEFAULT_SETTINGS.defaultPriorityId, notes: item.notes ?? "", startDate: item.startDate ?? null, deadline: item.deadline ?? null, tags: item.tags ?? [], estimateMinutes: item.estimateMinutes ?? null, createdAt: item.createdAt || now, updatedAt: item.updatedAt || now, completedAt: item.completedAt ?? null, archivedAt: item.archivedAt ?? null, timer: { totalSeconds: item.timer?.totalSeconds ?? 0, runningSince: item.timer?.runningSince ?? null, sessions: item.timer?.sessions ?? [] } };
}

function normalizeSketch(sketch?: Partial<PlannerSketch>, fallbackId?: string): PlannerSketch {
  return { id: sketch?.id || fallbackId || uniqueId("sketch"), title: sketch?.title || "Scratchpad", folderId: null, linkedItemId: sketch?.linkedItemId ?? null, tags: sketch?.tags ?? [], updatedAt: sketch?.updatedAt ?? null, shapeCount: sketch?.shapeCount ?? 0, snapshot: sketch?.snapshot ?? null };
}

function normalizeSettings(settings: Partial<PlannerSettings> | undefined, items: PlannerItem[]): PlannerSettings {
  const statuses: PlannerStatusOption[] = ensureOptions<PlannerStatusOption>(settings?.statuses, DEFAULT_STATUS_OPTIONS).map((status) => ({ id: status.id, label: status.label, isDone: status.isDone ?? status.id === "done" }));
  for (const item of items) if (!statuses.some((status) => status.id === item.status)) statuses.push({ id: item.status, label: titleCase(item.status), isDone: item.status === "done" });
  const priorities = ensureOptions(settings?.priorities, DEFAULT_PRIORITY_OPTIONS);
  for (const item of items) if (!priorities.some((priority) => priority.id === item.priority)) priorities.push({ id: item.priority, label: titleCase(item.priority) });
  const fallbackStatusId = statuses[0]?.id ?? DEFAULT_SETTINGS.defaultStatusId;
  const defaultStatusId = settings?.defaultStatusId && statuses.some((status) => status.id === settings.defaultStatusId) ? settings.defaultStatusId : fallbackStatusId;
  const doneStatusId = settings?.doneStatusId && statuses.some((status) => status.id === settings.doneStatusId) ? settings.doneStatusId : statuses.find((status) => status.isDone)?.id ?? statuses[statuses.length - 1]?.id ?? fallbackStatusId;
  const fallbackPriorityId = priorities[0]?.id ?? DEFAULT_SETTINGS.defaultPriorityId;
  const defaultPriorityId = settings?.defaultPriorityId && priorities.some((priority) => priority.id === settings.defaultPriorityId) ? settings.defaultPriorityId : fallbackPriorityId;
  return { statuses: statuses.map((status) => ({ ...status, isDone: status.id === doneStatusId })), priorities, defaultStatusId, doneStatusId, defaultPriorityId };
}

function ensureOptions<T extends PlannerOption>(options: T[] | undefined, fallback: T[]): T[] {
  const seen = new Set<string>();
  const next = (options && options.length > 0 ? options : fallback).map((option) => ({ ...option, id: option.id || slugify(option.label), label: option.label || titleCase(option.id) })).filter((option) => { if (!option.id || seen.has(option.id)) return false; seen.add(option.id); return true; });
  return next.length > 0 ? next : fallback.map((option) => ({ ...option }));
}

function createItem({ title, settings, startDate, tags }: { title: string; settings: PlannerSettings; startDate: string | null; tags: string[] }): PlannerItem {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title, status: settings.defaultStatusId, priority: settings.defaultPriorityId, notes: "", startDate, deadline: null, tags, estimateMinutes: null, createdAt: now, updatedAt: now, completedAt: null, archivedAt: null, timer: { ...EMPTY_TIMER, sessions: [] } };
}

function createSketchDocument(title: string, tags: string[], linkedItemId: string | null): PlannerSketch {
  return { id: uniqueId("sketch"), title: title.trim() || "Untitled sketch", folderId: null, linkedItemId, tags, updatedAt: null, shapeCount: 0, snapshot: null };
}

function withSketches(document: PlannerDocument, sketches: PlannerSketch[]): PlannerDocument {
  const nextSketches = sketches.length > 0 ? sketches : [createSketchDocument("Scratchpad", [], null)];
  return { ...document, sketches: nextSketches, sketch: nextSketches[0] };
}

function stampDocument(document: PlannerDocument): PlannerDocument {
  return { ...document, schemaVersion: 1, updatedAt: new Date().toISOString() };
}

function stopTimer(timer: PlannerTimerState, endedAt: string): PlannerTimerState {
  if (!timer.runningSince) return timer;
  const seconds = secondsBetween(timer.runningSince, endedAt);
  return { totalSeconds: timer.totalSeconds + seconds, runningSince: null, sessions: [{ startedAt: timer.runningSince, endedAt, seconds }, ...timer.sessions].slice(0, 50) };
}

function effectiveSeconds(timer: PlannerTimerState, nowMs: number): number {
  if (!timer.runningSince) return timer.totalSeconds;
  return timer.totalSeconds + Math.max(0, Math.floor((nowMs - Date.parse(timer.runningSince)) / 1000));
}

function secondsBetween(startedAt: string, endedAt: string): number {
  return Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
}

function isDoneStatus(status: string, settings: PlannerSettings): boolean {
  return status === settings.doneStatusId || settings.statuses.some((option) => option.id === status && option.isDone);
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

function formatDate(value: string | null, emptyLabel: string): string {
  if (!value) return emptyLabel;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatRelative(value: string): string {
  const diffMs = Date.now() - Date.parse(value);
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isDue(value: string | null): boolean {
  return !!value && Date.parse(value) < Date.now();
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function parseNullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
}

function uniqueId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
