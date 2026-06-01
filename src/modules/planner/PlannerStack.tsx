import type { Tab } from "@/modules/tabs";
import { PlannerApp } from "./PlannerApp";

type Props = {
  tabs: Tab[];
  activeId: number;
};

export function PlannerStack({ tabs, activeId }: Props) {
  const activeTab = tabs.find((tab) => tab.id === activeId);
  if (!activeTab || activeTab.kind !== "planner") return null;
  return <PlannerApp />;
}
