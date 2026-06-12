import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
import type { UnifiedPalette as UnifiedPaletteType } from "./UnifiedPalette";

const UnifiedPaletteInner = lazy(() =>
  import("./UnifiedPalette").then((m) => ({ default: m.UnifiedPalette })),
);

type Props = ComponentProps<typeof UnifiedPaletteType>;

export function UnifiedPalette(props: Props) {
  return (
    <Suspense fallback={null}>
      <UnifiedPaletteInner {...props} />
    </Suspense>
  );
}
