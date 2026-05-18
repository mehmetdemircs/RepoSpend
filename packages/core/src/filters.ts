import type { NormalizedUsage, UsageFilters } from "@repospend/types";

export function filterUsage(sessions: NormalizedUsage[], filters: UsageFilters): NormalizedUsage[] {
  return sessions.filter((session) => {
    if (!matchesAny(session.sourceClient, filters.source)) return false;
    if (!matchesAny(session.sourceApp, filters.sourceApp)) return false;
    if (!matchesRepo(session, filters.repo)) return false;
    if (!matchesAny(session.model, filters.model)) return false;
    const startedAt = timestamp(session.startedAt);
    const hasDateFilter = Boolean(filters.from || filters.to);
    if (hasDateFilter && startedAt === undefined) return false;
    const from = filters.from ? lowerBound(filters.from) : undefined;
    const to = filters.to ? upperBound(filters.to) : undefined;
    if (from !== undefined && startedAt !== undefined && startedAt < from) return false;
    if (to !== undefined && startedAt !== undefined && startedAt > to) return false;
    return true;
  });
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
