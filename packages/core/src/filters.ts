import type { NormalizedUsage, SessionModelUsage, UsageFilters } from "@repospend/types";

export function filterUsage(sessions: NormalizedUsage[], filters: UsageFilters): NormalizedUsage[] {
  return sessions.filter((session) => {
    if (!matchesAny(session.sourceClient, filters.source)) return false;
    if (!matchesAny(session.sourceApp, filters.sourceApp)) return false;
    if (!matchesRepo(session, filters.repo)) return false;
    if (!matchesModel(session, filters.model)) return false;
    const startedAt = timestamp(session.startedAt);
    const hasDateFilter = Boolean(filters.from || filters.to);
    if (hasDateFilter && startedAt === undefined) return false;
    const from = filters.from ? lowerBound(filters.from) : undefined;
    const to = filters.to ? upperBound(filters.to) : undefined;
    if (from !== undefined && startedAt !== undefined && startedAt < from) return false;
    if (to !== undefined && startedAt !== undefined && startedAt > to) return false;
    return true;
  }).map((session) => projectModelFilter(session, filters.model));
}

// When a model filter is active, a session with per-model usage only contributes the
// slices the user selected. The session keeps its identity (one row, one count) while
// token and cost totals reflect the chosen models, so filtered summaries, rollups, and
// exports never include the unselected models' usage.
function projectModelFilter(session: NormalizedUsage, filter: UsageFilters["model"]): NormalizedUsage {
  const values = filterValues(filter);
  if (!values.length || !session.modelUsage?.length) return session;
  const slices = session.modelUsage.filter((entry) => modelValueMatches(entry.model, values));
  const reasoningTokens = sumSlices(slices, "reasoningTokens");
  return {
    ...session,
    // The representative model must belong to the selected usage: keep the original
    // model when it is selected, otherwise use the first matching slice's model.
    model: session.model !== undefined && slices.some((entry) => entry.model === session.model) ? session.model : slices[0]?.model,
    modelUsage: slices,
    inputTokens: sumSlices(slices, "inputTokens"),
    cachedInputTokens: sumSlices(slices, "cachedInputTokens"),
    cacheCreationInputTokens: sumSlices(slices, "cacheCreationInputTokens"),
    cacheCreationInputTokens5m: sumSlices(slices, "cacheCreationInputTokens5m"),
    cacheCreationInputTokens1h: sumSlices(slices, "cacheCreationInputTokens1h"),
    cacheCreationInputTokens30m: sumSlices(slices, "cacheCreationInputTokens30m"),
    cacheCreationInputTokens12h: sumSlices(slices, "cacheCreationInputTokens12h"),
    outputTokens: sumSlices(slices, "outputTokens"),
    reasoningTokens,
    reasoningOutputTokens: reasoningTokens,
    totalTokens: sumSlices(slices, "totalTokens"),
    estimatedCostUsd: slices.every((entry) => entry.estimatedCostUsd !== undefined)
      ? slices.reduce((total, entry) => total + (entry.estimatedCostUsd ?? 0), 0)
      : undefined,
  };
}

function modelValueMatches(model: string | undefined, values: string[]): boolean {
  return values.includes(model ?? "unknown-model");
}

function sumSlices(slices: SessionModelUsage[], key: "inputTokens" | "cachedInputTokens" | "cacheCreationInputTokens" | "cacheCreationInputTokens5m" | "cacheCreationInputTokens1h" | "cacheCreationInputTokens30m" | "cacheCreationInputTokens12h" | "outputTokens" | "reasoningTokens" | "totalTokens"): number {
  return slices.reduce((total, entry) => total + (entry[key] ?? 0), 0);
}

function matchesAny(value: string | undefined, filter: UsageFilters["source"]): boolean {
  const values = filterValues(filter);
  if (!values.length) return true;
  return value !== undefined && values.includes(value);
}

function matchesRepo(session: NormalizedUsage, filter: UsageFilters["repo"]): boolean {
  const values = filterValues(filter);
  if (!values.length) return true;
  return values.includes(session.repoName) || values.includes(session.repoRoot);
}

function matchesModel(session: NormalizedUsage, filter: UsageFilters["model"]): boolean {
  const values = filterValues(filter);
  if (!values.length) return true;
  const models = session.modelUsage?.length ? session.modelUsage.map((entry) => entry.model) : [session.model];
  return models.some((model) => (model !== undefined ? values.includes(model) : values.includes("unknown-model")));
}

function filterValues(filter: string | string[] | undefined): string[] {
  if (!filter) return [];
  return Array.isArray(filter) ? filter.filter(Boolean) : filter.split(",").map((value) => value.trim()).filter(Boolean);
}

export function timestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function lowerBound(value: string): number | undefined {
  return timestamp(value.includes("T") ? value : `${value}T00:00:00.000Z`);
}

export function upperBound(value: string): number | undefined {
  return timestamp(value.includes("T") ? value : `${value}T23:59:59.999Z`);
}
