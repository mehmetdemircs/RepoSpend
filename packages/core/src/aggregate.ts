import type { NormalizedUsage, Summary, UsageGroup } from "@repospend/types";

export type { Summary, UsageGroup } from "@repospend/types";

export function summarize(sessions: NormalizedUsage[]): Summary {
  const repos = groupByRepo(sessions);
  const cost = sumKnownCost(sessions);
  const inputTokens = sum(sessions, "inputTokens");
  const cachedInputTokens = sum(sessions, "cachedInputTokens");
  const cacheCreationInputTokens = optionalSum(sessions, "cacheCreationInputTokens");
  const cacheCreationInputTokens5m = optionalSum(sessions, "cacheCreationInputTokens5m");
  const cacheCreationInputTokens1h = optionalSum(sessions, "cacheCreationInputTokens1h");
  return {
    estimatedCostUsd: cost.knownCount > 0 ? cost.value : undefined,
    knownCostSessions: cost.knownCount,
    totalTokens: sum(sessions, "totalTokens"),
    cachedInputTokens,
    cacheCreationInputTokens,
    cacheCreationInputTokens5m,
    cacheCreationInputTokens1h,
    inputTokens,
    outputTokens: sum(sessions, "outputTokens"),
    reasoningTokens: sum(sessions, "reasoningTokens"),
    cachedInputPct: inputTokens > 0 ? cachedInputTokens / inputTokens : 0,
    sessionCount: sessions.length,
    repoCount: repos.length,
    modelCount: new Set(sessions.map((session) => session.model).filter(Boolean)).size,
    mostExpensiveRepo: repos.filter((repo) => repo.estimatedCostUsd !== undefined).sort((a, b) => (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0))[0],
    unknownCostSessions: sessions.filter((session) => session.estimatedCostUsd === undefined).length,
    userPromptCount: optionalSum(sessions, "userPromptCount"),
    assistantMessageCount: optionalSum(sessions, "assistantMessageCount"),
    toolCallCount: optionalSum(sessions, "toolCallCount"),
    shellCommandCount: optionalSum(sessions, "shellCommandCount"),
    failedToolCallCount: optionalSum(sessions, "failedToolCallCount"),
    nonZeroCommandEvents: optionalSum(sessions, "nonZeroCommandEvents"),
    importantCommandFailures: optionalSum(sessions, "importantCommandFailures"),
    harmlessNonZeroEvents: optionalSum(sessions, "harmlessNonZeroEvents"),
    exploratoryMisses: optionalSum(sessions, "exploratoryMisses"),
    repeatedFailureClusters: optionalSum(sessions, "repeatedFailureClusters"),
    fileReadCount: optionalSum(sessions, "fileReadCount"),
    fileEditCount: optionalSum(sessions, "fileEditCount"),
    rawEventCount: optionalSum(sessions, "rawEventCount"),
    parseFailureCount: sessions.filter((session) => session.parseStatus === "failed" || (session.parseErrors?.length ?? 0) > 0).length,
    unknownSurfaceSessions: sessions.filter((session) => session.detectedSurface === "unknown").length,
    noCodeChangeSessions: sessions.filter((session) => (session.fileEditCount ?? 0) === 0).length,
    researchOnlySessions: sessions.filter((session) => session.sessionOutcome === "research_only").length,
    warnings: unique(sessions.flatMap((session) => session.warnings)),
  };
}

export function groupByRepo(sessions: NormalizedUsage[]): UsageGroup[] {
  const groups = groupBy(sessions, (session) => session.repoRoot, (session) => session.repoName);
  return groups.map((group) => ({
    ...group,
    verified: sessions.some((s) => s.repoRoot === group.id && !s.warnings.includes("repo_unverified_no_git_root")),
  }));
}

export function groupByModel(sessions: NormalizedUsage[]): UsageGroup[] {
  const groups = groupBy(sessions, (session) => session.model ?? "unknown-model", (session) => session.model ?? "Model not recorded");
  const unknownModelSessions = sessions.filter((session) => !session.model);
  // Keep mixed unknown-model buckets generic; only relabel when every unknown model is the Claude synthetic zero-usage case.
  if (unknownModelSessions.length > 0 && unknownModelSessions.every(isClaudeSyntheticZeroUsageSession)) {
    return groups.map((group) => group.id === "unknown-model" ? { ...group, label: "Claude synthetic / no usage" } : group);
  }
  return groups;
}

export function groupBySourceApp(sessions: NormalizedUsage[]): UsageGroup[] {
  return groupBy(sessions, (session) => session.sourceApp, (session) => session.sourceApp);
}

export function groupByDay(sessions: NormalizedUsage[]): UsageGroup[] {
  return groupBy(sessions, (session) => dateKey(session.startedAt), (session) => dateKey(session.startedAt));
}

export function groupByHour(sessions: NormalizedUsage[]): UsageGroup[] {
  return groupBy(sessions, (session) => hourKey(session.startedAt), (session) => hourKey(session.startedAt));
}

function groupBy(sessions: NormalizedUsage[], keyFn: (session: NormalizedUsage) => string, labelFn: (session: NormalizedUsage) => string): UsageGroup[] {
  const groups = new Map<string, UsageGroup>();
  for (const session of sessions) {
    const id = keyFn(session);
    const existing = groups.get(id);
    const group = existing ?? {
      id,
      label: labelFn(session),
      estimatedCostUsd: undefined,
      knownCostSessions: 0,
      unknownCostSessions: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheCreationInputTokens5m: 0,
      cacheCreationInputTokens1h: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      sessionCount: 0,
      messageCount: 0,
      warnings: [],
    };

    group.inputTokens += session.inputTokens;
    group.cachedInputTokens += session.cachedInputTokens;
    group.cacheCreationInputTokens = (group.cacheCreationInputTokens ?? 0) + (session.cacheCreationInputTokens ?? 0);
    group.cacheCreationInputTokens5m = (group.cacheCreationInputTokens5m ?? 0) + (session.cacheCreationInputTokens5m ?? 0);
    group.cacheCreationInputTokens1h = (group.cacheCreationInputTokens1h ?? 0) + (session.cacheCreationInputTokens1h ?? 0);
    group.outputTokens += session.outputTokens;
    group.reasoningTokens += session.reasoningTokens;
    group.totalTokens += session.totalTokens;
    group.sessionCount += 1;
    group.messageCount += session.messageCount;
    group.warnings = unique([...group.warnings, ...session.warnings]);
    if (session.estimatedCostUsd !== undefined) {
      group.estimatedCostUsd = roundCurrency((group.estimatedCostUsd ?? 0) + session.estimatedCostUsd);
      group.knownCostSessions += 1;
    } else {
      group.unknownCostSessions += 1;
    }
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0) || b.totalTokens - a.totalTokens);
}

function isClaudeSyntheticZeroUsageSession(session: NormalizedUsage): boolean {
  return session.warnings.includes("claude_synthetic_zero_usage");
}

export function toCsv(sessions: NormalizedUsage[]): string {
  const columns: Array<keyof NormalizedUsage> = [
    "id",
    "sourceClient",
    "sourceApp",
    "sourceAppRaw",
    "sourcePath",
    "repoRoot",
    "repoName",
    "cwd",
    "gitRemoteUrl",
    "gitBranch",
    "title",
    "startedAt",
    "endedAt",
    "model",
    "provider",
    "inputTokens",
    "cachedInputTokens",
    "cacheCreationInputTokens",
    "cacheCreationInputTokens5m",
    "cacheCreationInputTokens1h",
    "outputTokens",
    "reasoningTokens",
    "reasoningOutputTokens",
    "totalTokens",
    "tokenAggregationMethod",
    "tokenConfidence",
    "tokenSnapshotCount",
    "estimatedCostUsd",
    "messageCount",
    "rawTokenTotal",
    "warnings",
    "codexHome",
    "durationMs",
    "rawEventCount",
    "parseStatus",
    "parseErrors",
    "detectedSurface",
    "surfaceConfidence",
    "surfaceReason",
    "userPromptCount",
    "assistantMessageCount",
    "toolCallCount",
    "shellCommandCount",
    "failedToolCallCount",
    "nonZeroCommandEvents",
    "importantCommandFailures",
    "harmlessNonZeroEvents",
    "exploratoryMisses",
    "repeatedFailureClusters",
    "commandIssueSeverity",
    "commandIssueImpact",
    "topFailureType",
    "fileReadCount",
    "fileEditCount",
    "sessionOutcome",
  ];
  const rows = sessions.map((session) => columns.map((column) => csvEscape(Array.isArray(session[column]) ? (session[column] as string[]).join(";") : session[column])));
  return [columns.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sum(sessions: NormalizedUsage[], key: "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens" | "totalTokens"): number {
  return sessions.reduce((total, session) => total + session[key], 0);
}

function optionalSum(
  sessions: NormalizedUsage[],
  key:
    | "userPromptCount"
    | "assistantMessageCount"
    | "toolCallCount"
    | "shellCommandCount"
    | "failedToolCallCount"
    | "nonZeroCommandEvents"
    | "importantCommandFailures"
    | "harmlessNonZeroEvents"
    | "exploratoryMisses"
    | "repeatedFailureClusters"
    | "cacheCreationInputTokens"
    | "cacheCreationInputTokens5m"
    | "cacheCreationInputTokens1h"
    | "fileReadCount"
    | "fileEditCount"
    | "rawEventCount",
): number {
  return sessions.reduce((total, session) => total + (session[key] ?? 0), 0);
}

function sumKnownCost(sessions: NormalizedUsage[]): { value: number; knownCount: number } {
  return sessions.reduce<{ value: number; knownCount: number }>(
    (state, session) => ({
      value: roundCurrency(state.value + (session.estimatedCostUsd ?? 0)),
      knownCount: state.knownCount + (session.estimatedCostUsd === undefined ? 0 : 1),
    }),
    { value: 0, knownCount: 0 },
  );
}

function dateKey(date?: string): string {
  return date ? date.slice(0, 10) : "unknown-date";
}

function hourKey(date?: string): string {
  if (!date) return "unknown-hour";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "unknown-hour";
  return parsed.toISOString().slice(0, 13) + ":00:00.000Z";
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(6));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
