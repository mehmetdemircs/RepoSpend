import type { Filters, MetricKey, RangePreset, ViewKey } from "./app-types";
import { metricOptions, rangeOptions } from "./app-types";
import { dateInputValue, presetRange } from "./ui-utils";

export function parseUrlState(): { activeView: ViewKey; filters: Filters; rangePreset: RangePreset; metric: MetricKey; selectedRepo: string | null; selectedSessionId: string | null } {
  const params = new URLSearchParams(window.location.search);
  const pathParts = window.location.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  const rangePreset = parseRangePreset(params.get("range"));
  const range = rangePreset === "custom"
    ? { from: params.get("from") ?? "", to: params.get("to") ?? "" }
    : presetRange(rangePreset);
  return {
    activeView: parsePathView(pathParts) ?? "dashboard",
    rangePreset,
    filters: {
      source: parseListParam(params, "source"),
      sourceApp: parseListParam(params, "sourceApp"),
      repo: parseListParam(params, "repo"),
      model: parseListParam(params, "model"),
      ...range,
    },
    metric: parseMetric(params.get("metric")),
    selectedRepo: pathParts[0] === "repos" && pathParts[1] ? pathParts.slice(1).join("/") : null,
    selectedSessionId: pathParts[0] === "sessions" && pathParts[1] ? pathParts.slice(1).join("/") : null,
  };
}

export function buildUrlPath({ activeView, selectedRepo, selectedSessionId }: { activeView: ViewKey; selectedRepo: string | null; selectedSessionId: string | null }): string {
  if (activeView === "sessionDetail" && selectedSessionId) return `/sessions/${encodeURIComponent(selectedSessionId)}`;
  if (activeView === "repoDetail" && selectedRepo) return `/repos/${encodeURIComponent(selectedRepo)}`;
  if (activeView === "sessions") return "/sessions";
  if (activeView === "repos") return "/repos";
  if (activeView === "models") return "/models";
  if (activeView === "commands") return "/agent-friction";
  if (activeView === "insights") return "/insights";
  if (activeView === "rtk") return "/rtk";
  if (activeView === "settings") return "/settings";
  return "/";
}

export function buildUrlSearch({
  filters,
  rangePreset,
  metric,
}: {
  filters: Filters;
  rangePreset: RangePreset;
  metric: MetricKey;
}): string {
  const params = new URLSearchParams();
  setListParam(params, "source", filters.source);
  setListParam(params, "sourceApp", filters.sourceApp);
  setListParam(params, "repo", filters.repo);
  setListParam(params, "model", filters.model);
  if (rangePreset !== "last7") params.set("range", rangePreset);
  if (rangePreset === "custom") {
    if (filters.from) params.set("from", dateInputValue(filters.from));
    if (filters.to) params.set("to", dateInputValue(filters.to));
  }
  if (metric !== "totalTokens") params.set("metric", metric);
  const search = params.toString();
  return search ? `?${search}` : "";
}

function parsePathView(pathParts: string[]): ViewKey | undefined {
  if (pathParts.length === 0) return undefined;
  if (pathParts[0] === "sessions") return pathParts[1] ? "sessionDetail" : "sessions";
  if (pathParts[0] === "repos") return pathParts[1] ? "repoDetail" : "repos";
  if (pathParts[0] === "models") return "models";
  if (pathParts[0] === "agent-friction") return "commands";
  if (pathParts[0] === "insights") return "insights";
  if (pathParts[0] === "rtk") return "rtk";
  if (pathParts[0] === "settings") return "settings";
  return undefined;
}

function parseRangePreset(value: string | null): RangePreset {
  return rangeOptions.some((option) => option.value === value) ? value as RangePreset : "last7";
}

function parseMetric(value: string | null): MetricKey {
  return metricOptions.some((option) => option.value === value) ? value as MetricKey : "totalTokens";
}

function parseListParam(params: URLSearchParams, primary: string, fallback?: string): string[] {
  const values = [...params.getAll(primary), ...(fallback ? params.getAll(fallback) : [])];
  return [...new Set(values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];
}

function setListParam(params: URLSearchParams, key: string, values: string[]): void {
  if (values.length) params.set(key, values.join(","));
}
