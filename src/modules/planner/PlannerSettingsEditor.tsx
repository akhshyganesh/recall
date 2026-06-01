import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ArrowUp01Icon,
  Delete02Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import type {
  PlannerItem,
  PlannerOption,
  PlannerSettings,
  PlannerStatusOption,
} from "./api";

type Props = {
  settings: PlannerSettings;
  items: PlannerItem[];
  onSettingsChange: (settings: PlannerSettings) => void;
  onExport: () => void;
  onImportClick: () => void;
};

export function PlannerSettingsEditor({
  settings,
  items,
  onSettingsChange,
  onExport,
  onImportClick,
}: Props) {
  const [newStage, setNewStage] = useState("");
  const [newPriority, setNewPriority] = useState("");

  const updateStatus = (id: string, patch: Partial<PlannerStatusOption>) => {
    const statuses = settings.statuses.map((status) =>
      status.id === id
        ? { ...status, ...patch }
        : { ...status, ...(patch.isDone ? { isDone: false } : {}) },
    );
    onSettingsChange({
      ...settings,
      statuses,
      doneStatusId: patch.isDone ? id : settings.doneStatusId,
    });
  };

  const removeStatus = (id: string) => {
    if (items.some((item) => item.status === id) || settings.statuses.length <= 1) return;
    const statuses = settings.statuses.filter((status) => status.id !== id);
    const fallback = statuses[0]?.id ?? "inbox";
    onSettingsChange({
      ...settings,
      statuses,
      defaultStatusId: settings.defaultStatusId === id ? fallback : settings.defaultStatusId,
      doneStatusId: settings.doneStatusId === id ? fallback : settings.doneStatusId,
    });
  };

  const updatePriority = (id: string, label: string) => {
    onSettingsChange({
      ...settings,
      priorities: settings.priorities.map((priority) =>
        priority.id === id ? { ...priority, label } : priority,
      ),
    });
  };

  const removePriority = (id: string) => {
    if (items.some((item) => item.priority === id) || settings.priorities.length <= 1) return;
    const priorities = settings.priorities.filter((priority) => priority.id !== id);
    const fallback = priorities[0]?.id ?? "normal";
    onSettingsChange({
      ...settings,
      priorities,
      defaultPriorityId: settings.defaultPriorityId === id ? fallback : settings.defaultPriorityId,
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-sm border border-border/60 bg-card/60 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold tracking-tight">Planner Stages</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            These stages drive task dropdowns and kanban board columns.
          </p>
        </div>
        <div className="space-y-2">
          {settings.statuses.map((status) => {
            const inUse = items.some((item) => item.status === status.id);
            return (
              <div key={status.id} className="grid gap-2 rounded-sm border border-border/60 bg-background/65 p-2 md:grid-cols-[1fr_auto_auto_auto]">
                <Input value={status.label} onChange={(event) => updateStatus(status.id, { label: event.target.value })} className="h-8 rounded-md bg-background text-xs" />
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Switch size="sm" checked={status.id === settings.defaultStatusId} onCheckedChange={(checked) => checked && onSettingsChange({ ...settings, defaultStatusId: status.id })} />
                  Default
                </label>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Switch size="sm" checked={status.id === settings.doneStatusId || status.isDone} onCheckedChange={(checked) => checked && updateStatus(status.id, { isDone: true })} />
                  Done
                </label>
                <Button variant="ghost" size="icon-sm" className="rounded-md" disabled={inUse || settings.statuses.length <= 1} onClick={() => removeStatus(status.id)} title={inUse ? "Stage is used by tasks" : "Remove stage"}>
                  <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.75} />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={newStage} onChange={(event) => setNewStage(event.target.value)} placeholder="New stage" className="h-8 rounded-md bg-background text-xs" />
          <Button size="sm" className="rounded-md" onClick={() => {
            const option = createStatusOption(newStage, settings.statuses);
            if (!option) return;
            onSettingsChange({ ...settings, statuses: [...settings.statuses, option] });
            setNewStage("");
          }}>Add</Button>
        </div>
      </section>

      <section className="rounded-sm border border-border/60 bg-card/60 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold tracking-tight">Planner Priorities</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Every planner priority dropdown uses this list.
          </p>
        </div>
        <div className="space-y-2">
          {settings.priorities.map((priority) => {
            const inUse = items.some((item) => item.priority === priority.id);
            return (
              <div key={priority.id} className="grid gap-2 rounded-sm border border-border/60 bg-background/65 p-2 md:grid-cols-[1fr_auto_auto]">
                <Input value={priority.label} onChange={(event) => updatePriority(priority.id, event.target.value)} className="h-8 rounded-md bg-background text-xs" />
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Switch size="sm" checked={priority.id === settings.defaultPriorityId} onCheckedChange={(checked) => checked && onSettingsChange({ ...settings, defaultPriorityId: priority.id })} />
                  Default
                </label>
                <Button variant="ghost" size="icon-sm" className="rounded-md" disabled={inUse || settings.priorities.length <= 1} onClick={() => removePriority(priority.id)} title={inUse ? "Priority is used by tasks" : "Remove priority"}>
                  <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.75} />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={newPriority} onChange={(event) => setNewPriority(event.target.value)} placeholder="New priority" className="h-8 rounded-md bg-background text-xs" />
          <Button size="sm" className="rounded-md" onClick={() => {
            const option = createOption(newPriority, settings.priorities);
            if (!option) return;
            onSettingsChange({ ...settings, priorities: [...settings.priorities, option] });
            setNewPriority("");
          }}>Add</Button>
        </div>
      </section>

      <section className="rounded-sm border border-border/60 bg-card/60 p-4">
        <h3 className="text-sm font-semibold tracking-tight">Planner Import / Export</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Move the full planner, including tasks, timers, dropdowns, archived items, and sketches.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-md" onClick={onExport}>
            <HugeiconsIcon icon={Download01Icon} size={13} strokeWidth={1.75} />
            Export JSON
          </Button>
          <Button variant="outline" size="sm" className="rounded-md" onClick={onImportClick}>
            <HugeiconsIcon icon={ArrowUp01Icon} size={13} strokeWidth={1.75} />
            Import JSON
          </Button>
        </div>
      </section>
    </div>
  );
}

function createStatusOption(label: string, existing: PlannerStatusOption[]): PlannerStatusOption | null {
  const option = createOption(label, existing);
  return option ? { ...option, isDone: false } : null;
}

function createOption<T extends PlannerOption>(label: string, existing: T[]): PlannerOption | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const id = uniqueOptionId(slugify(trimmed), existing.map((option) => option.id));
  return { id, label: trimmed };
}

function uniqueOptionId(base: string, existing: string[]): string {
  const safeBase = base || "option";
  if (!existing.includes(safeBase)) return safeBase;
  let index = 2;
  while (existing.includes(`${safeBase}-${index}`)) index += 1;
  return `${safeBase}-${index}`;
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}