import type { DisplaySettings, Filters, FilterSortMode, MetricKey, PickerIcon, PickerOption, RangePreset, Session, Source, UsageGroup } from "./app-types";
import { chartLimitOptions, defaultDisplaySettings, metricOptions, pageSizeOptions } from "./app-types";
import { currencyCompact, moneyExact, tokensCompact, tokensExact } from "./format";

export function downloadText(filename: string, value: string): void {
  const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function toggleFilterValue(values: string[], value: string): string[] {
  if (!value) return [];
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function buildSourcePickerOptions(sources: Source[], sessions: Session[], selected: string[], sortMode: FilterSortMode): PickerOption[] {
  const usage = new Map<string, number>();
  for (const session of sessions) usage.set(session.sourceClient, (usage.get(session.sourceClient) ?? 0) + session.totalTokens);
  const options: PickerOption[] = sources.map((source) => ({
    value: source.id,
    label: source.label,
    icon: "source" as const,
    usage: usage.get(source.id) ?? 0,
  }));
  for (const value of selected) {
    if (!options.some((option) => option.value === value)) {
      options.push({ value, label: value, icon: "source", usage: usage.get(value) ?? 0 });
    }
  }
  return sortPickerOptions(options, sortMode);
}

export function buildGroupPickerOptions(groups: UsageGroup[], selected: string[], sortMode: FilterSortMode, icon: PickerIcon): PickerOption[] {
  const options = groups
    .filter((group) => icon !== "model" || group.totalTokens > 0 || selected.includes(group.label))
    .map((group) => ({ value: icon === "repo" ? group.id : group.label, label: group.label, icon, usage: group.totalTokens }));
  for (const value of selected) {
    if (!options.some((option) => option.value === value)) {
      options.push({ value, label: value, icon, usage: 0 });
    }
  }
  return sortPickerOptions(options, sortMode);
}

export function readFilterSortMode(): FilterSortMode {
  try {
    return window.localStorage.getItem("repospend.filterSortMode") === "name" ? "name" : "usage";
  } catch {
    return "usage";
  }
}

export function readDisplaySettings(): DisplaySettings {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("repospend.displaySettings.v2") ?? "{}") as Partial<DisplaySettings>;
    const chartGroupLimit = chartLimitOptions.includes(parsed.chartGroupLimit ?? 0) ? parsed.chartGroupLimit! : defaultDisplaySettings.chartGroupLimit;
    const tablePageSize = pageSizeOptions.includes(parsed.tablePageSize ?? 0) ? parsed.tablePageSize! : defaultDisplaySettings.tablePageSize;
    return { chartGroupLimit, tablePageSize };
  } catch {
    return defaultDisplaySettings;
  }
}

export function uniquePickerOptions(options: PickerOption[]): PickerOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

export function presetRange(preset: RangePreset): Pick<Filters, "from" | "to"> {
  const now = new Date();
  const rollingHours: Partial<Record<RangePreset, number>> = {
    lastHour: 1,
    last6: 6,
    last12: 12,
    last24: 24,
  };
  const hours = rollingHours[preset];
  if (hours) {
    return {
      from: new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString(),
      to: now.toISOString(),
    };
  }
  const rollingDays: Partial<Record<RangePreset, number>> = {
    last7: 7,
    last14: 14,
    last30: 30,
  };
  const days = rollingDays[preset];
  if (days) {
    return {
      from: dateOnly(new Date(now.getTime() - days * 24 * 60 * 60 * 1000)),
      to: dateOnly(now),
    };
  }
  if (preset === "thisWeek") {
    return {
      from: dateOnly(startOfWeek(now)),
      to: dateOnly(now),
    };
  }
  if (preset === "thisMonth") {
    return {
      from: dateOnly(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
      to: dateOnly(now),
    };
  }
  return { from: "", to: "" };
}

export function dateInputValue(value: string): string {
  return value.includes("T") ? value.slice(0, 10) : value;
}

export function rangeLabel(preset: RangePreset, filters: Filters): string {
  if (preset === "lastHour") return "Showing sessions from the last hour.";
  if (preset === "last6") return "Showing sessions from the last 6 hours.";
  if (preset === "last12") return "Showing sessions from the last 12 hours.";
  if (preset === "last24") return "Showing sessions from the last 24 hours.";
  if (preset === "last7" || preset === "last14" || preset === "last30" || preset === "thisWeek" || preset === "thisMonth") return `Showing sessions from ${dateInputValue(filters.from)} to ${dateInputValue(filters.to)}.`;
  if (preset === "all") return "Showing all local sessions.";
  return "";
}

export function surfaceLabel(surface: Session["detectedSurface"]): string {
  if (surface === "terminal_cli") return "Terminal";
  if (surface === "vscode_extension") return "VS Code";
  if (surface === "local_agent") return "Desktop local agent";
  if (surface === "codex_exec") return "Codex";
  if (surface === "codex_app_cloud") return "Codex app";
  return "Unknown";
}

export function sourceLabel(source: Session["sourceClient"]): string {
  if (source === "codex") return "Codex";
  if (source === "claude") return "Claude Code";
  if (source === "gemini-cli") return "Gemini CLI";
  if (source === "opencode") return "OpenCode";
  if (source === "cursor") return "Cursor";
  return "Unknown";
}

export function outcomeLabel(outcome: Session["sessionOutcome"]): string {
  if (outcome === "completed") return "Completed";
  if (outcome === "partial") return "Partial";
  if (outcome === "failed") return "Failed";
  if (outcome === "research_only") return "Research only";
  if (outcome === "no_code_change") return "No edits";
  if (outcome === "setup_debugging") return "Setup/debugging";
  return "Unknown";
}

export function outcomeTitle(outcome: Session["sessionOutcome"]): string {
  if (outcome === "completed") return "Codex activity appears to include detected file edits and no command failure signal.";
  if (outcome === "partial") return "RepoSpend saw useful activity, but also detected command failures or incomplete signals. This is worth reviewing, not necessarily a failed session.";
  if (outcome === "failed") return "Local logs suggest parsing failed or the session ended with a failure signal.";
  if (outcome === "research_only") return "No file edits were detected, but prompts or assistant messages were present. This may be normal research.";
  if (outcome === "no_code_change") return "No local file edits were detected for this session.";
  if (outcome === "setup_debugging") return "Commands were run, but no file edits were detected. Often setup, local debugging, or environment work.";
  return "RepoSpend could not infer a confident outcome from local logs.";
}

export function metricLabel(metric: MetricKey): string {
  return metricOptions.find((option) => option.value === metric)?.label ?? "Metric";
}

export function metricTick(metric: MetricKey, value: number): string {
  return metric === "estimatedCostUsd" ? currencyCompact(value) : tokensCompact(value);
}

export function tooltipMetric(metric: MetricKey, value: number) {
  return [metric === "estimatedCostUsd" ? moneyExact(value) : tokensExact(value), metricLabel(metric)];
}

export function groupUsageForChart(groups: UsageGroup[], metric: MetricKey, limit: number): UsageGroup[] {
  const sorted = groups.filter((group) => metricValue(group, metric) > 0).sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
  const safeLimit = Math.max(1, limit);
  if (sorted.length <= safeLimit) return sorted;
  const visible = sorted.slice(0, safeLimit);
  const hidden = sorted.slice(safeLimit);
  const knownCost = hidden.filter((group) => group.estimatedCostUsd !== undefined);
  const other: UsageGroup = {
    id: "__other",
    label: `Other (${hidden.length})`,
    estimatedCostUsd: knownCost.length ? roundCurrency(knownCost.reduce((sum, group) => sum + (group.estimatedCostUsd ?? 0), 0)) : undefined,
    inputTokens: hidden.reduce((sum, group) => sum + group.inputTokens, 0),
    cachedInputTokens: hidden.reduce((sum, group) => sum + group.cachedInputTokens, 0),
    outputTokens: hidden.reduce((sum, group) => sum + group.outputTokens, 0),
    reasoningTokens: hidden.reduce((sum, group) => sum + group.reasoningTokens, 0),
    reasoningOutputTokens: hidden.reduce((sum, group) => sum + (group.reasoningOutputTokens ?? 0), 0),
    totalTokens: hidden.reduce((sum, group) => sum + group.totalTokens, 0),
    sessionCount: hidden.reduce((sum, group) => sum + group.sessionCount, 0),
    messageCount: hidden.reduce((sum, group) => sum + group.messageCount, 0),
    warnings: [...new Set(hidden.flatMap((group) => group.warnings))].sort(),
  };
  return [...visible, other];
}

function sortPickerOptions(options: PickerOption[], sortMode: FilterSortMode): PickerOption[] {
  const unique = uniquePickerOptions(options);
  return [...unique].sort((a, b) => {
    if (sortMode === "usage") return (b.usage ?? 0) - (a.usage ?? 0) || a.label.localeCompare(b.label);
    return a.label.localeCompare(b.label);
  });
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  return start;
}

function metricValue(group: UsageGroup, metric: MetricKey): number {
  return metric === "estimatedCostUsd" ? group.estimatedCostUsd ?? 0 : group[metric];
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(6));
}
