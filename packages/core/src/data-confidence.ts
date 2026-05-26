import type { DataConfidenceIssue, DataConfidenceReport, DashboardSourceStats, NormalizedUsage, ScanOverview, SourceStatus } from "@repospend/types";

export interface DataConfidenceInput {
  sources: SourceStatus[];
  sourceStats: DashboardSourceStats[];
  sessions: NormalizedUsage[];
  scan: Partial<ScanOverview>;
}

export function buildDataConfidence(input: DataConfidenceInput): DataConfidenceReport {
  const sessions = input.sessions;
  const availableSources = input.sources.filter((source) => source.available);
  const importedSessions = input.sourceStats.reduce((sum, source) => sum + (source.sessionsImported ?? 0), 0);
  const tokenDataSessions = sessions.filter((session) => session.totalTokens > 0);
  const missingTokenSessions = sessions.filter((session) => session.totalTokens === 0 || session.warnings.includes("missing_token_breakdown"));
  const pricedTokenSessions = tokenDataSessions.filter((session) => session.estimatedCostUsd !== undefined);
  const unpricedTokenSessions = tokenDataSessions.filter((session) => session.estimatedCostUsd === undefined);
  const highConfidenceTokenSessions = tokenDataSessions.filter((session) => session.tokenConfidence === "high");
  const unknownRepoSessions = sessions.filter((session) => session.warnings.includes("repo_unverified_no_git_root"));
  const verifiedRepoSessions = sessions.filter((session) => !unknownRepoSessions.includes(session));
  const unknownSurfaceSessions = sessions.filter((session) => (session.detectedSurface ?? "unknown") === "unknown");
  const parseIssueCount = Math.max(
    input.scan.parseFailureCount ?? 0,
    input.sourceStats.reduce((sum, source) => sum + (source.parseFailureCount ?? 0), 0),
  );
  const sourceWarningCount = input.sources.reduce((sum, source) => sum + source.warnings.length, 0);
  const tokenDataPct = ratio(tokenDataSessions.length, sessions.length);
  const pricingCoveragePct = tokenDataSessions.length > 0 ? ratio(pricedTokenSessions.length, tokenDataSessions.length) : sessions.length > 0 ? 0 : 1;
  const highConfidenceTokenPct = tokenDataSessions.length > 0 ? ratio(highConfidenceTokenSessions.length, tokenDataSessions.length) : sessions.length > 0 ? 0 : 1;
  const verifiedRepoPct = ratio(verifiedRepoSessions.length, sessions.length);
  const parseHealthPct = parseIssueCount === 0 ? 1 : 1 - ratio(parseIssueCount, Math.max(input.scan.rawSessionCount ?? sessions.length, sessions.length, 1));
  const rawScore = Math.round(100 * (
    tokenDataPct * 0.3
    + pricingCoveragePct * 0.25
    + verifiedRepoPct * 0.18
    + highConfidenceTokenPct * 0.12
    + Math.max(parseHealthPct, 0) * 0.15
  ));
  const score = emptyDataScore(availableSources.length, importedSessions) ?? rawScore;
  const issues = dataConfidenceIssues({
    sessions,
    availableSources,
    importedSessions,
    tokenDataSessions,
    missingTokenSessions,
    unpricedTokenSessions,
    unknownRepoSessions,
    unknownSurfaceSessions,
    parseIssueCount,
    sourceWarningCount,
  });

  return {
    score,
    label: score >= 80 ? "High" : score >= 55 ? "Medium" : "Low",
    sessionCount: sessions.length,
    sourceCount: availableSources.length,
    tokenDataSessions: tokenDataSessions.length,
    missingTokenSessions: missingTokenSessions.length,
    pricedTokenSessions: pricedTokenSessions.length,
    unpricedTokenSessions: unpricedTokenSessions.length,
    highConfidenceTokenSessions: highConfidenceTokenSessions.length,
    verifiedRepoSessions: verifiedRepoSessions.length,
    unknownRepoSessions: unknownRepoSessions.length,
    unknownSurfaceSessions: unknownSurfaceSessions.length,
    parseIssueCount,
    sourceWarningCount,
    tokenDataPct,
    pricingCoveragePct,
    highConfidenceTokenPct,
    verifiedRepoPct,
    issues,
  };
}

function dataConfidenceIssues({
  sessions,
  availableSources,
  importedSessions,
  tokenDataSessions,
  missingTokenSessions,
  unpricedTokenSessions,
  unknownRepoSessions,
  unknownSurfaceSessions,
  parseIssueCount,
  sourceWarningCount,
}: {
  sessions: NormalizedUsage[];
  availableSources: SourceStatus[];
  importedSessions: number;
  tokenDataSessions: NormalizedUsage[];
  missingTokenSessions: NormalizedUsage[];
  unpricedTokenSessions: NormalizedUsage[];
  unknownRepoSessions: NormalizedUsage[];
  unknownSurfaceSessions: NormalizedUsage[];
  parseIssueCount: number;
  sourceWarningCount: number;
}): DataConfidenceIssue[] {
  const issues: DataConfidenceIssue[] = [];

  if (availableSources.length === 0) {
    issues.push({
      id: "no-local-sources",
      title: "No local source data found",
      detail: "RepoSpend did not find enabled local Codex, Claude Code, GitHub Copilot, or experimental Cursor data paths.",
      tone: "critical",
      affectedSessionIds: [],
    });
  } else if (sessions.length === 0 && importedSessions === 0) {
    issues.push({
      id: "no-sessions-imported",
      title: "No sessions imported",
      detail: "Source paths exist, but no local sessions were imported for the current scan window.",
      tone: "attention",
      affectedSessionIds: [],
    });
  }

  if (tokenDataSessions.length === 0 && sessions.length > 0) {
    issues.push({
      id: "no-token-data",
      title: "No token-bearing sessions",
      detail: "Sessions were imported, but local files did not include token counts that RepoSpend can price or roll up.",
      tone: "critical",
      affectedSessionIds: sessions.map((session) => session.id),
    });
  } else if (missingTokenSessions.length > 0) {
    issues.push({
      id: "missing-token-data",
      title: "Some sessions are missing token data",
      detail: `${missingTokenSessions.length} session${missingTokenSessions.length === 1 ? "" : "s"} have no token total or are missing a full token breakdown.`,
      tone: "attention",
      affectedSessionIds: missingTokenSessions.map((session) => session.id),
    });
  }

  if (unpricedTokenSessions.length > 0) {
    issues.push({
      id: "unpriced-token-sessions",
      title: "Some token-bearing sessions are unpriced",
      detail: `${unpricedTokenSessions.length} token-bearing session${unpricedTokenSessions.length === 1 ? "" : "s"} cannot show API-equivalent cost because pricing or token split coverage is missing.`,
      tone: "attention",
      affectedSessionIds: unpricedTokenSessions.map((session) => session.id),
    });
  }

  if (parseIssueCount > 0) {
    issues.push({
      id: "parse-issues",
      title: "Parser issues detected",
      detail: `${parseIssueCount} local file${parseIssueCount === 1 ? "" : "s"} reported parse issues or skipped records.`,
      tone: "attention",
      affectedSessionIds: sessions.filter((session) => session.parseStatus === "failed" || (session.parseErrors?.length ?? 0) > 0).map((session) => session.id),
    });
  }

  if (unknownRepoSessions.length > 0) {
    issues.push({
      id: "unknown-repo-grouping",
      title: "Some repo grouping is unverified",
      detail: `${unknownRepoSessions.length} session${unknownRepoSessions.length === 1 ? "" : "s"} could not be tied to a verified Git root.`,
      tone: "attention",
      affectedSessionIds: unknownRepoSessions.map((session) => session.id),
    });
  }

  if (unknownSurfaceSessions.length > 0) {
    issues.push({
      id: "unknown-surfaces",
      title: "Some app surfaces are unknown",
      detail: `${unknownSurfaceSessions.length} session${unknownSurfaceSessions.length === 1 ? "" : "s"} did not include enough metadata to identify the app or surface.`,
      tone: "attention",
      affectedSessionIds: unknownSurfaceSessions.map((session) => session.id),
    });
  }

  if (sourceWarningCount > 0) {
    issues.push({
      id: "source-warnings",
      title: "Source warnings were reported",
      detail: `${sourceWarningCount} source warning${sourceWarningCount === 1 ? " was" : "s were"} reported during local discovery.`,
      tone: "attention",
      affectedSessionIds: [],
    });
  }

  return issues;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 1;
  return numerator / denominator;
}

function emptyDataScore(availableSourceCount: number, importedSessions: number): number | undefined {
  if (availableSourceCount === 0) return 0;
  if (importedSessions === 0) return 50;
  return undefined;
}
