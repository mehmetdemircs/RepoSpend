import type { DashboardSnapshot, DashboardSourceStats, NormalizedUsage, SourceStatus, UsageFilters } from "@repospend/types";
import { groupByDay, groupByHour, groupByModel, groupBySourceApp, summarize } from "./aggregate.js";
import { filterUsage } from "./filters.js";
import { buildRepoRollups } from "./repo-rollup.js";
import { buildUsageHealth } from "./usage-health.js";

export type { DashboardSnapshot, DashboardSourceStats, ScanOverview } from "@repospend/types";

export interface DashboardSnapshotInput {
  sources: SourceStatus[];
  sourceStats: DashboardSourceStats[];
  sessions: NormalizedUsage[];
  filters?: UsageFilters;
}

export function buildDashboardSnapshot(input: DashboardSnapshotInput): DashboardSnapshot {
  const allSessions = input.sessions.filter((session) => session.totalTokens > 0);
  const filteredSessions = filterUsage(input.sessions, input.filters ?? {});
  const sessions = filteredSessions.filter((session) => session.totalTokens > 0);
  const summary = summarize(sessions);
  const repos = buildRepoRollups(sessions);
  const sourceApps = groupBySourceApp(sessions);
  const scan = {
    sessionCount: allSessions.length,
    zeroTokenSessionCount: input.sessions.length - allSessions.length,
    repoCount: buildRepoRollups(allSessions).length,
    modelCount: groupByModel(allSessions).length,
    sourceAppCount: groupBySourceApp(allSessions).length,
    rawSessionCount: input.sessions.length,
    rawEventCount: allSessions.reduce((sum, session) => sum + (session.rawEventCount ?? 0), 0),
    parseFailureCount: allSessions.filter((session) => session.parseStatus === "failed" || (session.parseErrors?.length ?? 0) > 0).length,
    sessionFileCount: input.sourceStats.reduce((sum, source) => sum + source.sessionFileCount, 0),
    lastScannedAt: input.sourceStats.map((source) => source.lastScannedAt).sort().at(-1) ?? new Date().toISOString(),
  };
  return {
    sources: input.sources,
    sourceStats: input.sourceStats,
    scan,
    sessions,
    skippedZeroTokenSessions: filteredSessions.length - sessions.length,
    summary,
    repos,
    days: groupByDay(sessions),
    hours: groupByHour(sessions),
    models: groupByModel(sessions),
    sourceApps,
    health: buildUsageHealth({ sessions, summary, repos, sourceApps, scan }),
  };
}
