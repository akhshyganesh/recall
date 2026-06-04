import { useMemo, useState } from "react";
import { getToolTheme } from "./toolStyle";
import type { ActivityPoint } from "./api";

const DAYS_PER_WEEK = 7;
const WEEK_COUNT = 12;

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, amount: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

function startOfWeek(date: Date): Date {
  const value = startOfDay(date);
  const dayOffset = (value.getDay() + 6) % DAYS_PER_WEEK;
  return addDays(value, -dayOffset);
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function labelDate(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function monthLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
  });
}

function dayOfMonth(key: string): number {
  return Number(key.slice(8, 10));
}

type Cell = {
  date: string;
  count: number;
  tool: string | null;
  points: ActivityPoint[];
};

export function ActivityHeatmap({ activity }: { activity: ActivityPoint[] }) {
  const [hovered, setHovered] = useState<Cell | null>(null);
  const { weeks, maxCount, activeDays } = useMemo(() => {
    const byDate = new Map<string, ActivityPoint[]>();
    for (const point of activity) {
      const points = byDate.get(point.date) ?? [];
      points.push(point);
      byDate.set(point.date, points);
    }

    const lastDay = startOfDay(new Date());
    const firstDay = startOfWeek(addDays(lastDay, -(WEEK_COUNT * DAYS_PER_WEEK - 1)));
    const cells: Cell[] = [];
    let max = 0;

    for (let index = 0; index < WEEK_COUNT * DAYS_PER_WEEK; index += 1) {
      const date = dayKey(addDays(firstDay, index));
      const points = byDate.get(date) ?? [];
      const count = points.reduce((sum, point) => sum + point.session_count, 0);
      const leadTool = [...points].sort(
        (left, right) => right.session_count - left.session_count,
      )[0]?.tool ?? null;
      max = Math.max(max, count);
      cells.push({ date, count, tool: leadTool, points });
    }

    const grouped: Cell[][] = [];
    for (let index = 0; index < WEEK_COUNT; index += 1) {
      grouped.push(cells.slice(index * DAYS_PER_WEEK, (index + 1) * DAYS_PER_WEEK));
    }

    return {
      weeks: grouped,
      maxCount: max,
      activeDays: cells.filter((cell) => cell.count > 0).length,
    };
  }, [activity]);
  const selected = hovered ?? [...weeks.flat()].reverse().find((cell) => cell.count > 0) ?? null;
  const weekdayLabels = ["M", "", "W", "", "F", "", "S"];

  return (
    <div className="rounded-md border border-border/45 bg-background/55 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold text-foreground">Activity</span>
        <span className="text-[10.5px] text-muted-foreground">{activeDays} active days</span>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `1rem repeat(${WEEK_COUNT}, minmax(0, 1fr))` }}
      >
        <span aria-hidden />
        {weeks.map((week, weekIndex) => {
          const firstOfMonth = week.find((cell) => dayOfMonth(cell.date) <= DAYS_PER_WEEK);
          const showLabel = weekIndex === 0 || !!firstOfMonth;
          return (
            <span
              key={`month-${weekIndex}`}
              className="h-3 overflow-visible whitespace-nowrap text-[9px] leading-3 text-muted-foreground"
            >
              {showLabel ? monthLabel(firstOfMonth?.date ?? week[0].date) : ""}
            </span>
          );
        })}
        {Array.from({ length: DAYS_PER_WEEK }).map((_, dayIndex) => (
          <div key={`row-${dayIndex}`} className="contents">
            <span className="h-3 text-[8.5px] leading-3 text-muted-foreground/80">
              {weekdayLabels[dayIndex]}
            </span>
            {weeks.map((week) => {
              const cell = week[dayIndex];
              const theme = getToolTheme(cell.tool ?? "Recall");
              const intensity = maxCount > 0 ? cell.count / maxCount : 0;
              return (
                <button
                  key={cell.date}
                  type="button"
                  aria-label={`${labelDate(cell.date)}: ${cell.count} session${cell.count === 1 ? "" : "s"}`}
                  onMouseEnter={() => setHovered(cell)}
                  onFocus={() => setHovered(cell)}
                  className="h-3 min-w-0 rounded-xs border border-border/35 bg-foreground/[0.035] outline-none transition-transform hover:scale-110 focus:ring-1 focus:ring-ring"
                  style={
                    cell.count > 0
                      ? {
                          backgroundColor: `rgba(${theme.rgb}, ${0.24 + intensity * 0.58})`,
                          borderColor: `rgba(${theme.rgb}, ${0.32 + intensity * 0.42})`,
                        }
                      : undefined
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-md border border-border/35 bg-card px-2 py-1.5">
        {selected ? (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10.5px] font-medium text-foreground">
                {labelDate(selected.date)}
              </div>
              <div className="mt-0.5 text-[9.5px] text-muted-foreground">
                {selected.count} session{selected.count === 1 ? "" : "s"}
              </div>
            </div>
            <div className="min-w-0 text-right text-[9.5px] text-muted-foreground">
              {selected.points.length === 0 ? (
                <span>No activity</span>
              ) : (
                selected.points
                  .slice()
                  .sort((left, right) => right.session_count - left.session_count)
                  .slice(0, 2)
                  .map((point) => (
                    <div key={`${point.date}-${point.tool}`} className="truncate">
                      {point.tool}: {point.session_count}
                    </div>
                  ))
              )}
            </div>
          </div>
        ) : (
          <div className="text-[10.5px] text-muted-foreground">No activity in this range</div>
        )}
      </div>
    </div>
  );
}