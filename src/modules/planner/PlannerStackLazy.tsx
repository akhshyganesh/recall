import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
import type { PlannerStack as PlannerStackType } from "./PlannerStack";

const PlannerStackInner = lazy(() =>
  import("./PlannerStack").then((module) => ({ default: module.PlannerStack })),
);

type Props = ComponentProps<typeof PlannerStackType>;

export function PlannerStack(props: Props) {
  return (
    <Suspense fallback={null}>
      <PlannerStackInner {...props} />
    </Suspense>
  );
}
