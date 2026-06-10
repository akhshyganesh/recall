import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

export function SettingRow({ title, description, children, className }: Props) {
  return (
    <div className={cn("flex items-center gap-4 px-4 py-2.5", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[12.5px] font-medium leading-tight">{title}</span>
        {description && (
          <span className="text-[11px] leading-relaxed text-muted-foreground/60">
            {description}
          </span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
