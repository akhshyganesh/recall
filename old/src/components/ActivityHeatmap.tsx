import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { getToolTheme } from '../lib/tool-style';
import type { ActivityPoint } from '../types';

const COMPACT_WEEK_COUNT = 13;
const DAYS_PER_WEEK = 7;
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const FULL_WEEK_COUNT = 26;
const COMPACT_LAYOUT_QUERY = '(max-width: 1380px)';

interface VendorBreakdown {
  key: string;
  label: string;
  rgb: string;
  count: number;
}

interface HeatmapCell {
  dateKey: string;
  total: number;
  tooltip: string;
  vendors: VendorBreakdown[];
}

function startOfLocalDay(date: Date): Date {
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
  const value = startOfLocalDay(date);
  const dayOffset = (value.getDay() + 6) % 7;
  return addDays(value, -dayOffset);
}

function formatDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLongDate(dayKey: string): string {
  return parseDayKey(dayKey).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMonthLabel(dayKey: string): string {
  return parseDayKey(dayKey).toLocaleDateString(undefined, { month: 'short' });
}

function pluralizeSessions(count: number): string {
  return `${count} session${count === 1 ? '' : 's'}`;
}

function buildCellStyle(cell: HeatmapCell, maxSessions: number): CSSProperties {
  if (cell.total === 0 || maxSessions === 0) {
    return {};
  }

  const intensity = cell.total / maxSessions;
  const fillAlpha = 0.28 + intensity * 0.54;
  const leadVendor = cell.vendors[0];
  const gradientStops: string[] = [];
  let offset = 0;

  cell.vendors.forEach((vendor, index) => {
    const width = index === cell.vendors.length - 1
      ? 100 - offset
      : (vendor.count / cell.total) * 100;
    const end = Math.min(100, offset + width);
    gradientStops.push(
      `rgba(${vendor.rgb}, ${fillAlpha}) ${offset}%`,
      `rgba(${vendor.rgb}, ${fillAlpha}) ${end}%`,
    );
    offset = end;
  });

  return {
    backgroundImage: [
      `linear-gradient(135deg, ${gradientStops.join(', ')})`,
      `radial-gradient(circle at 50% 20%, rgba(255,255,255,${0.08 + intensity * 0.12}), rgba(255,255,255,0))`,
    ].join(', '),
    borderColor: `rgba(${leadVendor.rgb}, ${0.24 + intensity * 0.52})`,
    boxShadow: [
      '0 0 0 1px rgba(255,255,255,0.05) inset',
      `0 0 ${8 + Math.round(intensity * 14)}px rgba(${leadVendor.rgb}, ${0.06 + intensity * 0.18})`,
    ].join(', '),
  };
}

export default function ActivityHeatmap({ activity }: { activity: ActivityPoint[] }) {
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null);
  const [weekCount, setWeekCount] = useState(() => {
    if (typeof window === 'undefined') {
      return FULL_WEEK_COUNT;
    }

    return window.matchMedia(COMPACT_LAYOUT_QUERY).matches ? COMPACT_WEEK_COUNT : FULL_WEEK_COUNT;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const syncWeekCount = (matches: boolean) => {
      setWeekCount(matches ? COMPACT_WEEK_COUNT : FULL_WEEK_COUNT);
    };
    const handleChange = (event: MediaQueryListEvent) => {
      syncWeekCount(event.matches);
    };

    syncWeekCount(mediaQueryList.matches);

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange);
      return () => mediaQueryList.removeEventListener('change', handleChange);
    }

    mediaQueryList.addListener(handleChange);
    return () => mediaQueryList.removeListener(handleChange);
  }, []);

  const {
    activeDays,
    cellByDate,
    focusedFallbackDate,
    maxSessions,
    monthLabels,
    peakDaySessions,
    vendorTotals,
    weeks,
  } = useMemo(() => {
    const vendorsByDay = new Map<string, Map<string, VendorBreakdown>>();
    const vendorTotalMap = new Map<string, VendorBreakdown>();

    for (const point of activity) {
      const theme = getToolTheme(point.tool);
      const dayVendors = vendorsByDay.get(point.date) ?? new Map<string, VendorBreakdown>();
      const existingDayVendor = dayVendors.get(theme.key);

      if (existingDayVendor) {
        existingDayVendor.count += point.session_count;
      } else {
        dayVendors.set(theme.key, {
          key: theme.key,
          label: theme.label,
          rgb: theme.rgb,
          count: point.session_count,
        });
      }

      vendorsByDay.set(point.date, dayVendors);

      const existingVendorTotal = vendorTotalMap.get(theme.key);
      if (existingVendorTotal) {
        existingVendorTotal.count += point.session_count;
      } else {
        vendorTotalMap.set(theme.key, {
          key: theme.key,
          label: theme.label,
          rgb: theme.rgb,
          count: point.session_count,
        });
      }
    }

    const lastDay = startOfLocalDay(new Date());
    const firstDay = startOfWeek(addDays(lastDay, -(weekCount * DAYS_PER_WEEK - 1)));
    const cells: HeatmapCell[] = [];
    let computedMaxSessions = 0;

    for (let dayIndex = 0; dayIndex < weekCount * DAYS_PER_WEEK; dayIndex += 1) {
      const currentDay = addDays(firstDay, dayIndex);
      const dateKey = formatDayKey(currentDay);
      const vendors = Array.from(vendorsByDay.get(dateKey)?.values() ?? []).sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        return left.label.localeCompare(right.label);
      });
      const total = vendors.reduce((sum, vendor) => sum + vendor.count, 0);
      const breakdown = vendors.length > 0
        ? vendors.map((vendor) => `${vendor.label} ${vendor.count}`).join(' · ')
        : 'No sessions';

      computedMaxSessions = Math.max(computedMaxSessions, total);
      cells.push({
        dateKey,
        total,
        tooltip: `${formatLongDate(dateKey)} · ${breakdown}`,
        vendors,
      });
    }

    const weeksList: HeatmapCell[][] = [];
    const monthLabelList: string[] = [];
    let previousMonthKey = '';

    for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
      const week = cells.slice(weekIndex * DAYS_PER_WEEK, (weekIndex + 1) * DAYS_PER_WEEK);
      const monthLabel = formatMonthLabel(week[0].dateKey);
      const monthKey = week[0].dateKey.slice(0, 7);

      weeksList.push(week);
      monthLabelList.push(weekIndex === 0 || monthKey !== previousMonthKey ? monthLabel : '');
      previousMonthKey = monthKey;
    }

    let fallbackDate = cells[cells.length - 1]?.dateKey ?? null;
    for (let index = cells.length - 1; index >= 0; index -= 1) {
      if (cells[index].total > 0) {
        fallbackDate = cells[index].dateKey;
        break;
      }
    }

    return {
      activeDays: cells.filter((cell) => cell.total > 0).length,
      cellByDate: new Map(cells.map((cell) => [cell.dateKey, cell])),
      focusedFallbackDate: fallbackDate,
      maxSessions: computedMaxSessions,
      monthLabels: monthLabelList,
      peakDaySessions: computedMaxSessions,
      vendorTotals: Array.from(vendorTotalMap.values()).sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        return left.label.localeCompare(right.label);
      }),
      weeks: weeksList,
    };
  }, [activity, weekCount]);

  const focusedDateKey = hoveredDateKey ?? focusedFallbackDate;
  const focusedCell = focusedDateKey ? cellByDate.get(focusedDateKey) : null;
  const focusedVendors = focusedCell?.vendors ?? [];
  const focusedSummary = focusedCell && focusedCell.total > 0
    ? `${pluralizeSessions(focusedCell.total)} across ${focusedVendors.length} vendor${focusedVendors.length === 1 ? '' : 's'}`
    : 'Run a scan to start painting the calendar.';

  return (
    <section className="hero-activity-card">
      <div className="hero-activity-header">
        <div className="hero-activity-copy-block">
          <span className="hero-activity-kicker">Activity atlas</span>
          <h2 className="hero-activity-title">Pulse the sessions</h2>
        </div>

        <div className="hero-activity-badges">
          <div className="hero-activity-badge">
            <strong>{activeDays}</strong>
            <span>active days</span>
          </div>
          <div className="hero-activity-badge">
            <strong>{peakDaySessions}</strong>
            <span>peak day</span>
          </div>
          <div className="hero-activity-badge">
            <strong>{vendorTotals.length}</strong>
            <span>Tools</span>
          </div>
        </div>
      </div>

      <div className="hero-activity-grid-wrap">
        <div className="activity-month-row">
          <span className="activity-axis-spacer" />
          <div
            className="activity-month-grid"
            style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
          >
            {monthLabels.map((label, index) => (
              <span key={`${label}-${index}`} className="activity-month-label">
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="activity-grid-shell">
          <div className="activity-day-labels">
            {DAY_LABELS.map((label, index) => (
              <span
                key={`${label}-${index}`}
                className={`activity-day-label ${index % 2 === 1 ? 'muted' : ''}`}
              >
                {label}
              </span>
            ))}
          </div>

          <div
            className="activity-week-grid"
            onMouseLeave={() => setHoveredDateKey(null)}
            style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
          >
            {weeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="activity-week-column">
                {week.map((cell) => (
                  <div
                    key={cell.dateKey}
                    className={`activity-cell ${cell.total === 0 ? 'activity-cell-empty' : ''}`}
                    onMouseEnter={() => setHoveredDateKey(cell.dateKey)}
                    style={buildCellStyle(cell, maxSessions)}
                    title={cell.tooltip}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hero-activity-footer">
        <div className="hero-activity-focus">
          <div className="hero-activity-focus-label">Spotlight</div>
          <div className="hero-activity-focus-title">
            {focusedDateKey ? formatLongDate(focusedDateKey) : 'No activity yet'}
          </div>
          <div className="hero-activity-focus-subtitle">{focusedSummary}</div>
        </div>

        <div className="hero-activity-legend">
          {focusedVendors.length > 0 ? (
            focusedVendors.map((vendor) => (
              <span key={vendor.key} className="activity-legend-pill">
                <span
                  className="activity-legend-dot"
                  style={{ backgroundColor: `rgb(${vendor.rgb})`, boxShadow: `0 0 10px rgba(${vendor.rgb}, 0.35)` }}
                />
                <span>{vendor.label}</span>
                <span className="activity-legend-count">{vendor.count}</span>
              </span>
            ))
          ) : (
            <span className="activity-legend-empty">No sessions indexed yet.</span>
          )}
        </div>
      </div>
    </section>
  );
}
