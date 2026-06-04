import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function SettingsCard({ title, children, className }: Props) {
  return (
    <div className={cn("flex flex-col", className)}>
      {title && (
        <div className="px-4 pb-2 pt-5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
            {title}
          </span>
        </div>
      )}
      <div className="flex flex-col divide-y divide-border/25">
        {children}
      </div>
    </div>
  );
}
