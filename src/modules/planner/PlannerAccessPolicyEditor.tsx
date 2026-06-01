import { Switch } from "@/components/ui/switch";
import type { PlannerAccessPolicy } from "./api";

type PlannerAccessPolicyKey = keyof PlannerAccessPolicy;

type Props = {
  policy: PlannerAccessPolicy;
  onPolicyChange: (patch: Partial<PlannerAccessPolicy>) => void;
};

const POLICY_OPTIONS: Array<{
  key: PlannerAccessPolicyKey;
  label: string;
  description: string;
}> = [
  { key: "exposeItems", label: "Items", description: "Task titles, stages, priorities, start dates, deadlines, and tags." },
  { key: "exposeNotes", label: "Notes", description: "Long-form notes attached to planner items." },
  { key: "exposeTimers", label: "Timers", description: "Tracked time totals, running clocks, and recent sessions." },
  { key: "exposeSketches", label: "Sketches", description: "Sketch names, tags, and linked planner items." },
  { key: "includeCompleted", label: "Completed Items", description: "Done tasks remain hidden unless this is enabled." },
];

export function PlannerAccessPolicyEditor({ policy, onPolicyChange }: Props) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {POLICY_OPTIONS.map((option) => (
        <PlannerAccessToggle
          key={option.key}
          label={option.label}
          description={option.description}
          checked={policy[option.key]}
          onChange={(checked) => onPolicyChange({ [option.key]: checked })}
        />
      ))}
    </div>
  );
}

function PlannerAccessToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-sm border border-border/60 bg-background/65 p-3">
      <div>
        <div className="text-xs font-medium">{label}</div>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{description}</p>
      </div>
      <Switch size="sm" checked={checked} onCheckedChange={onChange} />
    </div>
  );
}