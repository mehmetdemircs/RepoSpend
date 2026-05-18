import type { NormalizedUsage, RepoUsageRollup } from "@repospend/types";
import { groupByRepo, type UsageGroup } from "./aggregate.js";

export type { RepoUsageRollup } from "@repospend/types";

export function buildRepoRollups(sessions: NormalizedUsage[]): RepoUsageRollup[] {
  return groupByRepo(sessions).map((group) => {
    const repoSessions = sessions.filter((session) => session.repoRoot === group.id);
    return rollupFromGroup(group, repoSessions);
  });
}

export function rollupFromGroup(group: UsageGroup, sessions: NormalizedUsage[]): RepoUsageRollup {
  const fileEditCount = sessions.reduce((sum, session) => sum + (session.fileEditCount ?? 0), 0);
  const failedCommandCount = sessions.reduce((sum, session) => sum + (session.importantCommandFailures ?? session.failedToolCallCount ?? 0), 0);
  const tokenRoiTokensPerEdit = fileEditCount > 0 ? Math.round(group.totalTokens / fileEditCount) : undefined;
  const warnings = unique([...group.warnings, ...sessions.flatMap((session) => session.warnings), ...repoWarnings(group, sessions)]);
  return {
    ...group,
    sessions,
    warnings,
    fileEditCount,
    failedCommandCount,
    tokenRoiTokensPerEdit,
    tokenRoiLabel: tokenRoiTokensPerEdit === undefined ? "No edits" : `${compactNumber(tokenRoiTokensPerEdit)} tokens / edit`,
    tokenRoiTitle: tokenRoiTokensPerEdit === undefined
      ? "Token ROI cannot be computed because no file edits were detected for this repo."
      : "Token ROI estimates how much useful engineering activity was produced per token. Lower tokens per edit is usually better.",
  };
}

function repoWarnings(group: UsageGroup, sessions: NormalizedUsage[]): string[] {
  const warnings: string[] = [];
  if (sessions.some((session) => (session.fileEditCount ?? 0) === 0 && session.totalTokens >= 1_000_000)) warnings.push("high-token no-edit");
  if (sessions.some((session) => (session.importantCommandFailures ?? session.failedToolCallCount ?? 0) > 0)) warnings.push("command issues");
  if (group.estimatedCostUsd === undefined && group.totalTokens > 0) warnings.push("unknown pricing");
  if (group.inputTokens > 0 && group.cachedInputTokens / group.inputTokens < 0.1) warnings.push("low cache rate");
  return warnings;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, notation: "compact" }).format(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
