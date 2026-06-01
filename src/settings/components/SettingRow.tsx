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
    <div
      className={cn(
        "grid gap-3 rounded-lg border border-transparent px-3 py-3 transition-colors hover:border-border/35 hover:bg-background/55 md:grid-cols-[minmax(14rem,0.9fr)_minmax(12rem,0.55fr)]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12.5px] font-semibold">{title}</span>
        {description ? (
          <span className="max-w-2xl text-[10.5px] leading-relaxed text-muted-foreground">
            {description}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center md:justify-self-end">{children}</div>
    </div>
  );
}
