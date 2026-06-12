import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
import type { SessionHistoryStack as SessionHistoryStackType } from "./SessionHistoryStack";

const SessionHistoryStackInner = lazy(() =>
  import("./SessionHistoryStack").then((m) => ({
    default: m.SessionHistoryStack,
  })),
);

type Props = ComponentProps<typeof SessionHistoryStackType>;

export function SessionHistoryStack(props: Props) {
  return (
    <Suspense fallback={null}>
      <SessionHistoryStackInner {...props} />
    </Suspense>
  );
}
