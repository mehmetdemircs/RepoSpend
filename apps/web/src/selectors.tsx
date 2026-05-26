import React from "react";
import { CircleDollarSign, FolderGit2, Info, Terminal, TriangleAlert } from "lucide-react";
import { isCopilotAliasModel, isUsableModelPricing, resolvePricingForModel } from "@repospend/types";
import type {
  AgentFrictionRepo,
  ApiData,
  BreakdownRow,
  BreakdownTab,
  InsightItem,
  ModelPricing,
  ModelSortKey,
  ModelUsageRow,
  PricingProviderFilter,
  PricingResponse,
  PricingRow,
  QuickSessionFilter,
  RepoCommandTotals,
  RepoCostConcentration,
  RepoModelSpend,
  RepoReviewSession,
  RepoRow,
  RepoSessionQuickFilter,
  RepoSortKey,
  RtkCommand,
  RtkCommandSortKey,
  RtkCoverageGap,
  RtkGain,
  Session,
  SessionDetailTab,
  SessionSortKey,
  SortDirection,
  TokenStats,
  UsageGroup,
  ViewKey,
} from "./app-types";
import { count, money, percent, tokens } from "./format";
import { downloadText, outcomeLabel, sourceLabel, surfaceLabel } from "./ui-utils";

export function importantCommandFailures(session: Session): number {
  return session.importantCommandFailures ?? session.failedToolCallCount ?? 0;
}

export function sessionDisplayTitle(session: Session): string {
  const explicitTitle = cleanSessionTitleText(session.title?.trim() ?? "");
  if (explicitTitle) return explicitTitle;
  const firstPrompt = session.promptTimeline?.find((item) => item.role === "user" && item.text.trim())?.text.trim();
  if (firstPrompt) return truncateText(cleanSessionTitleText(firstPrompt).replace(/\s+/g, " "), 120);
  return `Session ${session.id.slice(0, 8)}`;
}

export function polishCostLanguage(value: string): string {
  return value
    .replace(/\bSpend is concentrated\b/g, "Estimated API-equivalent cost is concentrated")
    .replace(/\bspend is concentrated\b/g, "estimated API-equivalent cost is concentrated")
    .replace(/\bSpend\b/g, "Estimated API-equivalent cost")
    .replace(/\bspend\b/g, "estimated API-equivalent cost")
    .replace(/\bspent\b/g, "estimated");
}

export function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function cleanSessionTitleText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function relativeTimeLabel(value: string | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return value.slice(0, 10);
  const diffMs = Date.now() - timestamp;
  const absMs = Math.abs(diffMs);
  const units: Array<{ label: Intl.RelativeTimeFormatUnit; ms: number }> = [
    { label: "day", ms: 86_400_000 },
    { label: "hour", ms: 3_600_000 },
    { label: "minute", ms: 60_000 },
  ];
  const unit = units.find((item) => absMs >= item.ms) ?? { label: "minute" as const, ms: 60_000 };
  const amount = Math.round(diffMs / unit.ms);
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-amount, unit.label);
}

export function sessionNeedsCommandReview(session: Session): boolean {
  const important = importantCommandFailures(session);
  const nonZero = session.nonZeroCommandEvents ?? important;
  const commandCount = session.shellCommandCount ?? 0;
  const nonZeroRate = commandCount > 0 ? nonZero / commandCount : 0;
  return important > 0
    || (session.repeatedFailureClusters ?? 0) > 0
    || (commandCount >= 4 && nonZeroRate >= 0.5)
    || (session.totalTokens >= 1_000_000 && nonZero > 0)
    || ((session.sessionOutcome === "partial" || session.sessionOutcome === "failed") && nonZero > 0);
}

export function issueImpactLabel(impact: Session["commandIssueImpact"] | undefined): string {
  if (impact === "high") return "High";
  if (impact === "medium") return "Medium";
  if (impact === "low") return "Low";
  return "None";
}

export function rtkHookLabel(status: RtkGain["rtkCodexHookStatus"]): string {
  if (status === "active") return "Active";
  if (status === "not_detected") return "Not detected";
  return "Unknown";
}

export function failureTypeLabel(type: string | undefined): string {
  if (!type) return "None";
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function strongerImpact(current: Session["commandIssueImpact"] | undefined, next: Session["commandIssueImpact"] | undefined): Session["commandIssueImpact"] {
  const order = { none: 0, low: 1, medium: 2, high: 3 };
  const currentValue = order[current ?? "none"];
  const nextValue = order[next ?? "none"];
  return nextValue > currentValue ? (next ?? "none") : (current ?? "none");
}

export function dominantFailureType(current: string | undefined, next: string | undefined): string | undefined {
  if (!current) return next;
  if (!next) return current;
  return current;
}

export function repoRows(data: ApiData): RepoRow[] {
  return data.repos.map((repo) => ({
    ...repo,
    sessions: repo.sessions ?? data.sessions.filter((session) => session.repoRoot === repo.id),
    fileEditCount: repo.fileEditCount ?? 0,
    failedCommandCount: repo.failedCommandCount ?? 0,
    tokenRoiLabel: repo.tokenRoiLabel ?? "No edits",
    tokenRoiTitle: repo.tokenRoiTitle ?? "Tokens per edit cannot be computed because no file edits were detected for this repo or folder.",
  }));
}

export function repoRowsFromGroup(repo: UsageGroup, sessions: Session[]): RepoRow {
  const fileEditCount = sessions.reduce((sum, session) => sum + (session.fileEditCount ?? 0), 0);
  const failedCommandCount = sessions.reduce((sum, session) => sum + importantCommandFailures(session), 0);
  const tokensPerEdit = fileEditCount > 0 ? Math.round(repo.totalTokens / fileEditCount) : undefined;
  const warnings = [...new Set([...repo.warnings, ...sessions.flatMap((session) => session.warnings), ...repoProductWarnings(repo, sessions)])];
  return {
    ...repo,
    warnings,
    fileEditCount,
    failedCommandCount,
    tokenRoiLabel: tokensPerEdit === undefined ? "No edits" : `${tokens(tokensPerEdit)} / edit`,
    tokenRoiTitle: tokensPerEdit === undefined
      ? "Tokens per edit cannot be computed because no file edits were detected for this repo or folder."
      : "Tokens per edit estimates how much token volume was used for each detected file edit. Lower is usually more efficient.",
  };
}

export function modelUsageRows(data: ApiData): ModelUsageRow[] {
  const repos = repoRows(data);
  return data.models.filter((model) => model.sessionCount > 0 || model.totalTokens > 0 || model.estimatedCostUsd !== undefined).map((model) => {
    const sessions = data.sessions.filter((session) => (session.model ?? "unknown-model") === model.id);
    const topRepo = repos
      .map((repo) => ({
        repo,
        cost: sessions.filter((session) => session.repoRoot === repo.id).reduce((sum, session) => sum + (session.estimatedCostUsd ?? 0), 0),
        tokens: sessions.filter((session) => session.repoRoot === repo.id).reduce((sum, session) => sum + session.totalTokens, 0),
      }))
      .filter((item) => item.tokens > 0 || item.cost > 0)
      .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens)[0]?.repo;
    const latestSession = recentSessions(sessions)[0];
    return {
      ...model,
      providerLabel: modelProviderLabel(model.id),
      cacheRate: model.inputTokens > 0 ? model.cachedInputTokens / model.inputTokens : 0,
      averageCostUsd: model.estimatedCostUsd !== undefined && model.sessionCount > 0 ? model.estimatedCostUsd / model.sessionCount : undefined,
      topRepo,
      latestSession,
    };
  }).sort((a, b) => nullableNumber(b.estimatedCostUsd) - nullableNumber(a.estimatedCostUsd) || b.totalTokens - a.totalTokens || a.label.localeCompare(b.label));
}

export function modelProviderLabel(model: string): string {
  const provider = pricingProvider(model);
  if (provider === "openai") return "OpenAI";
  if (provider === "claude") return "Claude";
  return "Custom";
}

type DashboardAction = { label: string; detail: string; icon: React.ReactElement; tone: "attention" | "good" | "neutral"; view: ViewKey; repoId?: string; sessionId?: string; sessionTab?: SessionDetailTab };

export function topDashboardActions(data: ApiData): DashboardAction[] {
  const actions: DashboardAction[] = [];
  const topIssueSession = [...data.sessions].sort((a, b) => importantCommandFailures(b) - importantCommandFailures(a) || b.totalTokens - a.totalTokens)[0];
  const topRepo = repoRows(data)[0];
  const unpriced = data.sessions.filter((session) => session.estimatedCostUsd === undefined && session.totalTokens > 0).length;
  if (topIssueSession && importantCommandFailures(topIssueSession) > 0) {
    actions.push({
      label: "Review possible failed commands",
      detail: `${count(importantCommandFailures(topIssueSession), "flagged command")} in ${topIssueSession.repoName}`,
      icon: <TriangleAlert />,
      tone: "attention",
      view: "commands",
      sessionId: topIssueSession.id,
      sessionTab: "files",
    });
  }
  if (topRepo) {
    actions.push({
      label: "Inspect top repo / folder",
      detail: `${topRepo.label} has ${tokens(topRepo.totalTokens)} and ${money(topRepo.estimatedCostUsd)} API-equivalent cost`,
      icon: <FolderGit2 />,
      tone: "neutral",
      view: "repoDetail",
      repoId: topRepo.id,
    });
  }
  if (unpriced > 0) {
    actions.push({
      label: "Check pricing coverage",
      detail: `${count(unpriced, "token-bearing session")} cannot show API-equivalent cost`,
      icon: <CircleDollarSign />,
      tone: "attention",
      view: "settings",
    });
  }
  if (actions.length < 3 && data.health.attentionCount > 0) {
    actions.push({
      label: "Open usage health",
      detail: `${count(data.health.attentionCount, "attention item")} in the current filter`,
      icon: <Info />,
      tone: "attention",
      view: "insights",
    });
  }
  if (actions.length < 3) {
    actions.push({
      label: "Scan recent sessions",
      detail: `${count(data.sessions.length, "session")} loaded for this filter`,
      icon: <Terminal />,
      tone: "good",
      view: "sessions",
    });
  }
  return actions.slice(0, 3);
}

export function repoCostConcentration(repo: RepoRow, sessions: Session[]): RepoCostConcentration {
  const knownCostSessions = topSessions(sessions.filter((session) => session.estimatedCostUsd !== undefined), true);
  const totalCost = repo.estimatedCostUsd ?? knownCostSessions.reduce((sum, session) => sum + (session.estimatedCostUsd ?? 0), 0);
  const topSessionCost = knownCostSessions[0]?.estimatedCostUsd;
  const topThree = knownCostSessions.slice(0, 3);
  const topThreeCostValue = topThree.reduce((sum, session) => sum + (session.estimatedCostUsd ?? 0), 0);
  const topSessionShare = totalCost > 0 && topSessionCost !== undefined ? topSessionCost / totalCost : 0;
  const topThreeShare = totalCost > 0 ? topThreeCostValue / totalCost : 0;
  return {
    topSessionCost,
    topSessionShare,
    topThreeCost: topThree.length ? Number(topThreeCostValue.toFixed(6)) : undefined,
    topThreeShare,
    topSessions: knownCostSessions.length ? topThree : topSessions(sessions, false).slice(0, 3),
    extreme: topSessionShare >= 0.5,
  };
}

export function topSessionsToReview(sessions: Session[], repo: RepoRow): RepoReviewSession[] {
  const picks = new Map<string, RepoReviewSession>();
  const add = (session: Session | undefined, reason: string) => {
    if (!session) return;
    const existing = picks.get(session.id);
    picks.set(session.id, { session, reason: existing ? `${existing.reason}; ${reason.toLowerCase()}` : reason });
  };
  const costSorted = topSessions(sessions, sessions.some((session) => session.estimatedCostUsd !== undefined));
  add(costSorted[0], "Highest estimated cost");
  add([...sessions].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0], "Longest duration");
  add(sessions.find((session) => session.sessionOutcome === "partial" || session.sessionOutcome === "failed"), "Partial or failed outcome");
  add([...sessions].sort((a, b) => importantCommandFailures(b) - importantCommandFailures(a))[0], "Possible failed commands");
  const tokenOutlier = [...sessions].sort((a, b) => b.totalTokens - a.totalTokens)[0];
  if (tokenOutlier && isTokenOutlier(tokenOutlier, sessions)) add(tokenOutlier, "Unusual token volume");
  return [...picks.values()]
    .filter(({ session }) => session.totalTokens > 0 || session.estimatedCostUsd !== undefined || session.durationMs !== undefined || sessionNeedsCommandReview(session))
    .sort((a, b) => reviewReasonPriority(a.reason) - reviewReasonPriority(b.reason) || nullableNumber(b.session.estimatedCostUsd) - nullableNumber(a.session.estimatedCostUsd))
    .slice(0, Math.min(6, Math.max(repo.sessionCount, 0)));
}

export function reviewReasonPriority(reason: string): number {
  if (reason.includes("Highest")) return 0;
  if (reason.includes("Command")) return 1;
  if (reason.includes("Partial")) return 2;
  if (reason.includes("Unusual")) return 3;
  return 4;
}

export function isTokenOutlier(session: Session, sessions: Session[]): boolean {
  if (session.totalTokens >= 1_000_000) return true;
  const average = sessions.length ? sessions.reduce((sum, item) => sum + item.totalTokens, 0) / sessions.length : 0;
  return average > 0 && session.totalTokens >= average * 2.5;
}

export function repoModelBreakdown(sessions: Session[], repo: RepoRow): RepoModelSpend[] {
  const rows = new Map<string, RepoModelSpend>();
  const totalCost = repo.estimatedCostUsd ?? sessions.reduce((sum, session) => sum + (session.estimatedCostUsd ?? 0), 0);
  for (const session of sessions) {
    const id = session.model ?? "unknown-model";
    const row = rows.get(id) ?? { id, label: session.model ?? "Model not recorded", sessionCount: 0, totalTokens: 0, estimatedCostUsd: undefined, costShare: 0 };
    row.sessionCount += 1;
    row.totalTokens += session.totalTokens;
    if (session.estimatedCostUsd !== undefined) row.estimatedCostUsd = Number(((row.estimatedCostUsd ?? 0) + session.estimatedCostUsd).toFixed(6));
    rows.set(id, row);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, costShare: totalCost > 0 && row.estimatedCostUsd !== undefined ? row.estimatedCostUsd / totalCost : 0 }))
    .sort((a, b) => nullableNumber(b.estimatedCostUsd) - nullableNumber(a.estimatedCostUsd) || b.totalTokens - a.totalTokens);
}

export function repoDailyBreakdown(sessions: Session[]): Array<{ id: string; label: string; estimatedCostUsd: number; totalTokens: number }> {
  const rows = new Map<string, { id: string; label: string; estimatedCostUsd: number; totalTokens: number }>();
  for (const session of sessions) {
    const id = (session.startedAt ?? session.endedAt ?? "Unknown").slice(0, 10);
    const row = rows.get(id) ?? { id, label: id, estimatedCostUsd: 0, totalTokens: 0 };
    row.estimatedCostUsd += session.estimatedCostUsd ?? 0;
    row.totalTokens += session.totalTokens;
    rows.set(id, row);
  }
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id)).map((row) => ({ ...row, estimatedCostUsd: Number(row.estimatedCostUsd.toFixed(6)) }));
}

export function repoCommandTotals(sessions: Session[]): RepoCommandTotals {
  return {
    important: sessions.reduce((sum, session) => sum + importantCommandFailures(session), 0),
    harmless: sessions.reduce((sum, session) => sum + (session.harmlessNonZeroEvents ?? 0) + (session.exploratoryMisses ?? 0), 0),
    repeated: sessions.reduce((sum, session) => sum + (session.repeatedFailureClusters ?? 0), 0),
  };
}

export function repoDiagnosisSentence(repo: RepoRow, sessions: Session[], concentration: RepoCostConcentration, topModel: RepoModelSpend | undefined): string {
  const parts: string[] = [];
  if (concentration.extreme) {
    parts.push("Most estimated API-equivalent cost came from one expensive session");
  } else if (topModel) {
    parts.push(`Most estimated API-equivalent cost is driven by ${topModel.label}`);
  } else {
    parts.push("Estimated API-equivalent cost is spread across the loaded sessions");
  }
  if (topModel && concentration.extreme) parts.push(`running ${topModel.label}`);
  const commandText = repo.failedCommandCount > 0 ? `${count(repo.failedCommandCount, "possible failed command")} were detected` : "No possible failed commands were detected";
  const fileText = repo.fileEditCount > 0
    ? "File path analysis is limited because this log format may not include stable file paths"
    : "No file edits were detected in this filtered view";
  if (!sessions.length) return "No sessions matched this repo or folder in the current filters.";
  return `${parts.join(" ")}. ${commandText}. ${fileText}.`;
}

export function tokenIntensityInterpretation(repo: RepoRow): string {
  if (repo.fileEditCount <= 0) return "No file edits detected";
  const value = repo.totalTokens / repo.fileEditCount;
  if (value >= 1_000_000) return "High token use per file edit";
  if (value <= 100_000) return "Low token use per file edit";
  return "Moderate token use per file edit";
}

export function repoCostDriverExplanation(repo: RepoRow, topModel: RepoModelSpend | undefined): string {
  if (repo.estimatedCostUsd === undefined) return "API-equivalent cost is unavailable because this repo or folder is missing pricing coverage or token splits.";
  if (topModel && topModel.costShare >= 0.5) {
    return `${topModel.label} is the main cost driver at ${money(topModel.estimatedCostUsd)} across ${count(topModel.sessionCount, "session")}, representing ${percent(topModel.costShare)} of known repo cost.`;
  }
  const dominantToken = [
    { label: "input", value: repo.inputTokens },
    { label: "cached input", value: repo.cachedInputTokens },
    { label: "output", value: repo.outputTokens },
    { label: "reasoning", value: repo.reasoningTokens },
  ].sort((a, b) => b.value - a.value)[0] ?? { label: "tokens", value: repo.totalTokens };
  return `No single model dominates known cost. The largest token bucket is ${dominantToken.label} at ${tokens(dominantToken.value)}.`;
}

export function agentFrictionRepos(sessions: Session[]): AgentFrictionRepo[] {
  const groups = new Map<string, AgentFrictionRepo>();
  for (const session of sessions) {
    const importantFailures = importantCommandFailures(session);
    const harmlessNonZeroEvents = (session.harmlessNonZeroEvents ?? 0) + (session.exploratoryMisses ?? 0);
    const repeatedFailureClusters = session.repeatedFailureClusters ?? 0;
    if (importantFailures === 0 && harmlessNonZeroEvents === 0 && repeatedFailureClusters === 0) continue;
    const existing = groups.get(session.repoRoot) ?? {
      repoRoot: session.repoRoot,
      repoName: session.repoName,
      importantFailures: 0,
      harmlessNonZeroEvents: 0,
      repeatedFailureClusters: 0,
      sessionsNeedingReview: 0,
      topFailureType: undefined,
      impact: "none",
      totalTokens: 0,
      estimatedCostUsd: undefined,
    };
    existing.importantFailures += importantFailures;
    existing.harmlessNonZeroEvents += harmlessNonZeroEvents;
    existing.repeatedFailureClusters += repeatedFailureClusters;
    existing.sessionsNeedingReview += sessionNeedsCommandReview(session) ? 1 : 0;
    existing.totalTokens += session.totalTokens;
    existing.topFailureType = dominantFailureType(existing.topFailureType, session.topFailureType);
    existing.impact = strongerImpact(existing.impact, session.commandIssueImpact);
    if (session.estimatedCostUsd !== undefined) {
      existing.estimatedCostUsd = Number(((existing.estimatedCostUsd ?? 0) + session.estimatedCostUsd).toFixed(6));
    }
    groups.set(session.repoRoot, existing);
  }
  return [...groups.values()].sort((a, b) => b.importantFailures - a.importantFailures || b.repeatedFailureClusters - a.repeatedFailureClusters || b.totalTokens - a.totalTokens);
}

export function repoProductWarnings(repo: UsageGroup, sessions: Session[]): string[] {
  const warnings: string[] = [];
  if (sessions.some((session) => (session.fileEditCount ?? 0) === 0 && session.totalTokens >= 1_000_000)) warnings.push("high-token no-edit");
  if (sessions.some((session) => importantCommandFailures(session) > 0)) warnings.push("command issues");
  if (repo.estimatedCostUsd === undefined && repo.totalTokens > 0) warnings.push("unknown pricing");
  if (repo.inputTokens > 0 && repo.cachedInputTokens / repo.inputTokens < 0.1) warnings.push("low cache rate");
  return warnings;
}

export function sessionBadges(session: Session): string[] {
  const badges: string[] = [];
  const outcome = outcomeLabel(session.sessionOutcome);
  if (importantCommandFailures(session) > 0) badges.push("Possible failed command");
  if (session.totalTokens >= 1_000_000) badges.push("High token");
  if ((session.fileEditCount ?? 0) === 0 && outcome !== "No edits") badges.push("No edits");
  if (session.warnings.includes("repo_unverified_no_git_root")) badges.push("Unknown repo/folder");
  if ((session.detectedSurface ?? "unknown") === "unknown") badges.push("Unknown surface");
  if ((session.fileEditCount ?? 0) > 0) badges.push("Files edited");
  badges.push(outcome);
  if (session.estimatedCostUsd === undefined && session.totalTokens > 0) badges.push("Unknown pricing");
  if (session.warnings.includes("claude_synthetic_zero_usage")) badges.push("Synthetic usage marker");
  if (session.warnings.includes("missing_token_breakdown")) badges.push("Unknown tokens");
  return [...new Set(badges)].filter((badge) => badge && badge !== "Unknown");
}

export function readableWarning(warning: string): string {
  const normalized = warning.toLowerCase();
  if (normalized === "expensive_session_concentration") return "Cost concentration is very high. One session accounts for most of this repo or folder’s estimated cost.";
  if (normalized === "failed commands" || normalized === "command issues") return "Possible failed commands were detected in this repo or folder.";
  if (normalized === "repo_unverified_no_git_root") return "Repo/folder grouping is unverified because no Git root was detected.";
  if (normalized === "copilot_missing_cwd") return "GitHub Copilot did not include a local workspace path, so the session is grouped under Unknown repo/folder.";
  if (normalized === "claude_synthetic_zero_usage") return "Claude only persisted a synthetic zero-usage marker for this session, so the real model and token counts are unavailable locally.";
  if (normalized === "unknown_pricing" || normalized === "unknown_cost") return "Some sessions cannot be priced because token splits or pricing coverage are missing.";
  if (normalized === "missing_token_breakdown") return "Some sessions are missing detailed token breakdowns.";
  if (normalized === "low_cache_rate") return "Cache reuse is low, so input tokens may be driving more estimated cost.";
  if (normalized === "output_heavy_sessions") return "Output tokens are unusually high compared with total token volume.";
  if (normalized === "high-token no-edit") return "A high-token session had no detected file edits.";
  if (normalized === "duplicate_or_stale_token_snapshots_skipped") return "Duplicate or stale token snapshots were skipped while counting tokens.";
  if (normalized === "token_direct_usage_ignored_after_cumulative_snapshot") return "Direct token usage was ignored after a cumulative snapshot to avoid double counting.";
  if (normalized.startsWith("invalid_token_snapshots")) return "Invalid token snapshots were skipped while counting tokens.";
  if (normalized === "copilot_partial_token_breakdown") return "GitHub Copilot exposed a partial token breakdown for this session.";
  if (normalized === "copilot_duplicate_session_merged") return "Duplicate GitHub Copilot session fragments were merged.";
  if (normalized === "model_inferred_from_import_source") return "Model name was inferred from local import metadata.";
  return warning.replaceAll("_", " ");
}

export function pricingRows(draft: Record<string, ModelPricing>, models: UsageGroup[]): PricingRow[] {
  const usedModels = models.map((model) => model.id).filter((model) => model !== "unknown-model");
  const modelNames = [...new Set([...usedModels, ...Object.keys(draft).sort()])];
  return modelNames.map((model) => ({ model, ...resolvePricingForModel(model, draft) }));
}

export function pricingProvider(model: string): Exclude<PricingProviderFilter, "all"> {
  const normalized = model.toLowerCase();
  if (normalized.includes("claude")) return "claude";
  if (normalized.includes("gemini")) return "google";
  if (isCopilotAliasModel(normalized)) return "copilot";
  if (normalized.startsWith("gpt-") || normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4") || normalized.startsWith("codex") || normalized.includes("openai")) return "openai";
  return "custom";
}

export function pricingMissing(row: PricingRow): boolean {
  return !isUsableModelPricing(row.pricing);
}

export function compactModelLabel(model: string): string {
  return model.length > 28 ? `${model.slice(0, 25)}...` : model;
}

export function sourceImportedSessions(data: ApiData, sourceId: "codex" | "claude" | "cursor" | "copilot"): number {
  return data.sourceStats
    .filter((source) => source.sourceId === sourceId)
    .reduce((sum, source) => sum + (source.sessionsImported ?? 0), 0);
}

export function cursorSourceEnabled(data: ApiData | null | undefined): boolean {
  return data?.config.experimentalSources?.cursor === true;
}

export function sourceHomePath(source: ApiData["sourceStats"][number]): string {
  return source.homePath ?? source.codexHome ?? source.claudeHome ?? source.cursorHome ?? source.copilotHome ?? "Unknown";
}

export function sourcePrimaryDataFound(source: ApiData["sourceStats"][number]): boolean {
  return Boolean(source.stateExists || source.sessionsExists || source.projectsExists || source.historyExists || source.otelExists || (source.otelFileCount ?? 0) > 0 || (source.databaseFileCount ?? 0) > 0);
}

export function sourceEmptyFix(source: ApiData["sourceStats"][number]): string {
  if (!sourcePrimaryDataFound(source)) return "Install or run the local source once, then refresh.";
  if ((source.sessionsImported ?? 0) === 0) {
    if (source.sourceId === "cursor") return "Open Cursor chat or agent sessions locally, then rescan.";
    if (source.sourceId === "copilot") return "Enable Copilot OTEL export or use Copilot Chat in VS Code, then rescan.";
    if (source.sourceId === "claude") return "Run Claude Code in a repo with local history enabled, then rescan.";
    return "Run Codex in a repo so local session files can be imported.";
  }
  if ((source.parseFailureCount ?? 0) > 0) return "Some files were skipped; check Settings for parse warnings.";
  return "Ready.";
}

export function sourceDetectedPaths(source: ApiData["sourceStats"][number], data: ApiData): string[] {
  const statusPaths = data.sources.find((status) => status.id === source.sourceId)?.paths ?? [];
  const paths = [
    source.homePath,
    source.codexHome,
    source.claudeHome,
    source.cursorHome,
    source.copilotHome,
    source.statePath,
    source.sessionsPath,
    source.projectsPath,
    source.historyPath,
    source.otelPath,
    source.globalStoragePath,
    source.workspaceStoragePath,
    ...statusPaths,
  ].filter((value): value is string => Boolean(value));
  return [...new Set(paths)];
}

export function tokenStats(data: ApiData): TokenStats {
  const methodCounts: Record<string, number> = {};
  const confidenceCounts: Record<string, number> = {};
  let tokenSnapshots = 0;
  let sessionsWithTokenData = 0;
  for (const session of data.sessions) {
    const method = session.tokenAggregationMethod ?? "unknown";
    const confidence = session.tokenConfidence ?? "low";
    methodCounts[method] = (methodCounts[method] ?? 0) + 1;
    confidenceCounts[confidence] = (confidenceCounts[confidence] ?? 0) + 1;
    tokenSnapshots += session.tokenSnapshotCount ?? 0;
    if (session.totalTokens > 0) sessionsWithTokenData += 1;
  }
  const topMethod = topEntry(methodCounts)?.[0] ?? "unknown";
  const topConfidence = topEntry(confidenceCounts)?.[0] ?? "low";
  return {
    methodLabel: aggregationMethodLabel(topMethod),
    confidenceLabel: confidenceLabel(topConfidence),
    tokenSnapshots,
    sessionsWithTokenData,
    sessionsMissingTokenData: Math.max(data.scan.rawSessionCount - sessionsWithTokenData, 0),
    methodCounts,
    confidenceCounts,
  };
}

export function usageBreakdownRows(data: ApiData, tab: BreakdownTab): BreakdownRow[] {
  if (tab === "apps") return usageByApp(data);
  return usageBySource(data);
}

export function usageBySource(data: ApiData): BreakdownRow[] {
  const labels = new Map(data.sources.map((source) => [source.id, source.label]));
  const rows = new Map<string, BreakdownRow>();
  for (const source of data.sources) {
    rows.set(source.id, { id: source.id, label: source.label, source: source.id, sessionCount: 0, totalTokens: 0, estimatedCostUsd: undefined, knownCostSessions: 0, unknownCostSessions: 0, missingTokenSessions: 0 });
  }
  for (const session of data.sessions) {
    const row = rows.get(session.sourceClient) ?? {
      id: session.sourceClient,
      label: labels.get(session.sourceClient) ?? sourceLabel(session.sourceClient),
      source: session.sourceClient,
      sessionCount: 0,
      totalTokens: 0,
      estimatedCostUsd: undefined,
      knownCostSessions: 0,
      unknownCostSessions: 0,
      missingTokenSessions: 0,
    };
    row.sessionCount += 1;
    row.totalTokens += session.totalTokens;
    row.missingTokenSessions += session.totalTokens > 0 ? 0 : 1;
    if (session.estimatedCostUsd !== undefined) {
      row.estimatedCostUsd = Number(((row.estimatedCostUsd ?? 0) + session.estimatedCostUsd).toFixed(6));
      row.knownCostSessions += 1;
    } else {
      row.unknownCostSessions += 1;
    }
    rows.set(session.sourceClient, row);
  }
  return [...rows.values()];
}

export function usageByApp(data: ApiData): BreakdownRow[] {
  return groupSessionsForBreakdown(data.sessions, (session) => session.sourceApp || surfaceLabel(session.detectedSurface), (session) => session.sourceApp || surfaceLabel(session.detectedSurface));
}

export function groupSessionsForBreakdown(sessions: Session[], keyFn: (session: Session) => string, labelFn: (session: Session) => string, iconLabelFn = labelFn): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const session of sessions) {
    const id = keyFn(session);
    const row = rows.get(id) ?? {
      id,
      label: labelFn(session),
      iconLabel: iconLabelFn(session),
      sessionCount: 0,
      totalTokens: 0,
      estimatedCostUsd: undefined,
      knownCostSessions: 0,
      unknownCostSessions: 0,
      missingTokenSessions: 0,
    };
    row.sessionCount += 1;
    row.totalTokens += session.totalTokens;
    row.missingTokenSessions += session.totalTokens > 0 ? 0 : 1;
    if (session.estimatedCostUsd !== undefined) {
      row.estimatedCostUsd = Number(((row.estimatedCostUsd ?? 0) + session.estimatedCostUsd).toFixed(6));
      row.knownCostSessions += 1;
    } else {
      row.unknownCostSessions += 1;
    }
    rows.set(id, row);
  }
  return [...rows.values()].sort((a, b) => b.totalTokens - a.totalTokens || a.label.localeCompare(b.label));
}

export function breakdownCostLabel(row: BreakdownRow): string {
  if (row.knownCostSessions === 0) return "Not priced";
  const label = money(row.estimatedCostUsd);
  return row.unknownCostSessions > 0 ? `Known ${label}` : label;
}

export function topEntry(record: Record<string, number>): [string, number] | undefined {
  return Object.entries(record).sort((a, b) => b[1] - a[1])[0];
}

export function aggregationMethodLabel(method: string): string {
  if (method === "final_snapshot") return "Final checkpoint";
  if (method === "delta_sum") return "Delta sum";
  if (method === "direct_usage") return "Direct usage";
  if (method === "estimated") return "Estimated";
  return "Unknown";
}

export function confidenceLabel(confidence: string): string {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  return "Low";
}

export function cacheRate(repo: UsageGroup): number {
  return repo.inputTokens > 0 ? repo.cachedInputTokens / repo.inputTokens : 0;
}

export function sortRepoRows(repos: RepoRow[], sort: { key: RepoSortKey; direction: SortDirection }): RepoRow[] {
  return [...repos].sort((a, b) => applyDirection(compareRepo(a, b, sort.key), sort.direction));
}

export function sortModelRows(models: ModelUsageRow[], sort: { key: ModelSortKey; direction: SortDirection }): ModelUsageRow[] {
  return [...models].sort((a, b) => applyDirection(compareModel(a, b, sort.key), sort.direction));
}

export function compareModel(a: ModelUsageRow, b: ModelUsageRow, key: ModelSortKey): number {
  if (key === "model") return a.label.localeCompare(b.label);
  if (key === "cost") return nullableNumber(a.estimatedCostUsd) - nullableNumber(b.estimatedCostUsd);
  if (key === "tokens") return a.totalTokens - b.totalTokens;
  if (key === "input") return a.inputTokens - b.inputTokens;
  if (key === "cached") return a.cachedInputTokens - b.cachedInputTokens;
  if (key === "output") return a.outputTokens - b.outputTokens;
  if (key === "reasoning") return a.reasoningTokens - b.reasoningTokens;
  if (key === "sessions") return a.sessionCount - b.sessionCount;
  if (key === "cache") return a.cacheRate - b.cacheRate;
  if (key === "repo") return (a.topRepo?.label ?? "").localeCompare(b.topRepo?.label ?? "");
  return latestActivityTimestamp(a) - latestActivityTimestamp(b);
}

export function latestActivityTimestamp(row: ModelUsageRow): number {
  const raw = row.latestSession?.startedAt ?? row.latestSession?.endedAt;
  if (!raw) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

export function compareRepo(a: RepoRow, b: RepoRow, key: RepoSortKey): number {
  if (key === "repo") return a.label.localeCompare(b.label);
  if (key === "cost") return nullableNumber(a.estimatedCostUsd) - nullableNumber(b.estimatedCostUsd);
  if (key === "tokens") return a.totalTokens - b.totalTokens;
  if (key === "input") return a.inputTokens - b.inputTokens;
  if (key === "cached") return a.cachedInputTokens - b.cachedInputTokens;
  if (key === "output") return a.outputTokens - b.outputTokens;
  if (key === "reasoning") return a.reasoningTokens - b.reasoningTokens;
  if (key === "sessions") return a.sessionCount - b.sessionCount;
  if (key === "files") return a.fileEditCount - b.fileEditCount;
  if (key === "failed") return a.failedCommandCount - b.failedCommandCount;
  if (key === "roi") return tokenRoiSortValue(a) - tokenRoiSortValue(b);
  if (key === "warnings") return a.warnings.length - b.warnings.length;
  return cacheRate(a) - cacheRate(b);
}

export function tokenRoiSortValue(repo: RepoRow): number {
  if (repo.fileEditCount === 0) return Number.POSITIVE_INFINITY;
  return repo.totalTokens / repo.fileEditCount;
}

export function sortSessionRows(sessions: Session[], sort: { key: SessionSortKey; direction: SortDirection }): Session[] {
  return [...sessions].sort((a, b) => applyDirection(compareSession(a, b, sort.key), sort.direction));
}

export function compareSession(a: Session, b: Session, key: SessionSortKey): number {
  if (key === "repo") return a.repoName.localeCompare(b.repoName);
  if (key === "app") return `${sourceLabel(a.sourceClient)} ${a.sourceApp}`.localeCompare(`${sourceLabel(b.sourceClient)} ${b.sourceApp}`);
  if (key === "session") return (a.title ?? a.id).localeCompare(b.title ?? b.id);
  if (key === "model") return (a.model ?? "Unknown").localeCompare(b.model ?? "Unknown");
  if (key === "started") return (a.startedAt ?? "").localeCompare(b.startedAt ?? "");
  if (key === "cost") return nullableNumber(a.estimatedCostUsd) - nullableNumber(b.estimatedCostUsd);
  if (key === "tokens") return a.totalTokens - b.totalTokens;
  if (key === "input") return a.inputTokens - b.inputTokens;
  if (key === "cached") return a.cachedInputTokens - b.cachedInputTokens;
  if (key === "output") return a.outputTokens - b.outputTokens;
  if (key === "reasoning") return a.reasoningTokens - b.reasoningTokens;
  if (key === "duration") return (a.durationMs ?? 0) - (b.durationMs ?? 0);
  if (key === "prompts") return (a.userPromptCount ?? 0) - (b.userPromptCount ?? 0);
  if (key === "commands") return (a.shellCommandCount ?? 0) - (b.shellCommandCount ?? 0);
  if (key === "files") return (a.fileEditCount ?? 0) - (b.fileEditCount ?? 0);
  if (key === "failed") return importantCommandFailures(a) - importantCommandFailures(b);
  if (key === "warnings") return a.warnings.length - b.warnings.length;
  return a.messageCount - b.messageCount;
}

export function sessionMatchesSearch(session: Session, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const isUnpricedTokenSession = session.estimatedCostUsd === undefined && session.totalTokens > 0;
  const haystack = [
    session.title,
    session.id,
    session.repoName,
    session.sourceApp,
    surfaceLabel(session.detectedSurface),
    session.model,
    outcomeLabel(session.sessionOutcome),
    isUnpricedTokenSession ? "unpriced cannot be priced missing pricing missing price missing token split missing token breakdown api-equivalent cost unavailable" : undefined,
    ...session.warnings.map(readableWarning),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

export function sessionMatchesQuickFilter(session: Session, filter: QuickSessionFilter | ""): boolean {
  if (!filter) return true;
  if (filter === "highToken") return session.totalTokens >= 1_000_000;
  if (filter === "failedCommands") return importantCommandFailures(session) > 0;
  if (filter === "noEdits") return (session.fileEditCount ?? 0) === 0;
  if (filter === "completed") return session.sessionOutcome === "completed";
  if (filter === "partial") return session.sessionOutcome === "partial";
  if (filter === "vscode") return session.detectedSurface === "vscode_extension" || session.sourceApp.toLowerCase().includes("vs code");
  if (filter === "terminal") return session.detectedSurface === "terminal_cli" || session.sourceApp.toLowerCase().includes("terminal");
  return (session.detectedSurface ?? "unknown") === "unknown";
}

export function sessionMatchesRepoQuickFilter(session: Session, filter: RepoSessionQuickFilter | "", sessions: Session[]): boolean {
  if (!filter) return true;
  if (filter === "expensive") return isCostOutlier(session, sessionCostOutlierThreshold(sessions));
  if (filter === "partial") return session.sessionOutcome === "partial" || session.sessionOutcome === "failed";
  if (filter === "longRunning") return isLongRunningSession(session, sessions);
  if (filter === "commandIssues") return importantCommandFailures(session) > 0 || (session.repeatedFailureClusters ?? 0) > 0;
  return (session.model ?? "").toLowerCase().includes("opus");
}

export function sessionCostOutlierThreshold(sessions: Session[]): number | undefined {
  const costs = sessions.map((session) => session.estimatedCostUsd).filter((value): value is number => value !== undefined).sort((a, b) => a - b);
  if (costs.length < 3) return costs.at(-1);
  const average = costs.reduce((sum, value) => sum + value, 0) / costs.length;
  return Math.max(average * 2, costs[Math.floor(costs.length * 0.75)] ?? average);
}

export function isCostOutlier(session: Session, threshold: number | undefined): boolean {
  return threshold !== undefined && session.estimatedCostUsd !== undefined && session.estimatedCostUsd >= threshold && session.estimatedCostUsd > 0;
}

export function isLongRunningSession(session: Session, sessions: Session[]): boolean {
  const durations = sessions.map((item) => item.durationMs ?? 0).filter((value) => value > 0);
  if (!session.durationMs || !durations.length) return false;
  const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  return session.durationMs >= Math.max(60 * 60_000, average * 1.75);
}

export function insightSeverity(item: InsightItem): "Info" | "Warning" | "Critical" {
  if (item.critical) return "Critical";
  if (item.tone === "attention") return "Warning";
  return "Info";
}

export function applyDirection(value: number, direction: SortDirection): number {
  return direction === "asc" ? value : -value;
}

export function nullableNumber(value: number | undefined): number {
  return value ?? Number.NEGATIVE_INFINITY;
}

export function usePagination<T>(items: T[], pageSize: number): { page: number; pageCount: number; items: T[]; setPage: (page: number) => void } {
  const safePageSize = Math.max(1, pageSize);
  const [page, setPageState] = React.useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  React.useEffect(() => {
    setPageState(1);
  }, [items.length, safePageSize]);
  const setPage = React.useCallback((nextPage: number) => {
    setPageState(Math.min(Math.max(1, nextPage), pageCount));
  }, [pageCount]);
  const safePage = Math.min(page, pageCount);
  return {
    page: safePage,
    pageCount,
    items: items.slice((safePage - 1) * safePageSize, safePage * safePageSize),
    setPage,
  };
}

export function topSessions(sessions: Session[], hasKnownCost: boolean): Session[] {
  return [...sessions].sort((a, b) => (hasKnownCost ? nullableNumber(b.estimatedCostUsd) - nullableNumber(a.estimatedCostUsd) : b.totalTokens - a.totalTokens));
}

export function recentSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => (b.startedAt ?? b.endedAt ?? "").localeCompare(a.startedAt ?? a.endedAt ?? ""));
}

export function findSessionById(data: ApiData, sessionId: string | null): Session | undefined {
  if (!sessionId) return undefined;
  return data.sessions.find((session) => session.id === sessionId);
}

export function exportSessionsCsv(sessions: Session[]): void {
  const rows = sessions.map((session) => ({
    repo: session.repoName,
    repoRoot: session.repoRoot,
    source: sourceLabel(session.sourceClient),
    app: session.sourceApp ?? surfaceLabel(session.detectedSurface),
    session: sessionDisplayTitle(session),
    sessionId: session.id,
    model: session.model ?? "Unknown",
    startedAt: session.startedAt ?? "",
    durationMs: session.durationMs ?? "",
    estimatedCostUsd: session.estimatedCostUsd ?? "",
    totalTokens: session.totalTokens,
    inputTokens: session.inputTokens,
    cachedInputTokens: session.cachedInputTokens,
    outputTokens: session.outputTokens,
    reasoningTokens: session.reasoningTokens,
    messages: session.messageCount,
    prompts: session.userPromptCount ?? 0,
    commands: session.shellCommandCount ?? 0,
    commandIssues: importantCommandFailures(session),
    fileEdits: session.fileEditCount ?? 0,
    outcome: session.sessionOutcome ?? "unknown",
    tokenConfidence: session.tokenConfidence ?? "unknown",
  }));
  downloadText(`repospend-sessions-${new Date().toISOString().slice(0, 10)}.csv`, objectsToCsv(rows));
}

export function exportReposCsv(repos: RepoRow[]): void {
  const rows = repos.map((repo) => ({
    repo: repo.label,
    repoRoot: repo.id,
    estimatedCostUsd: repo.estimatedCostUsd ?? "",
    totalTokens: repo.totalTokens,
    inputTokens: repo.inputTokens,
    cachedInputTokens: repo.cachedInputTokens,
    outputTokens: repo.outputTokens,
    reasoningTokens: repo.reasoningTokens,
    sessions: repo.sessionCount,
    fileEdits: repo.fileEditCount,
    commandIssues: repo.failedCommandCount,
    tokenRoi: repo.tokenRoiLabel,
    warnings: repo.warnings.join("; "),
  }));
  downloadText(`repospend-repos-${new Date().toISOString().slice(0, 10)}.csv`, objectsToCsv(rows));
}

export function objectsToCsv(rows: Array<Record<string, string | number>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(",")),
  ].join("\n");
}

export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function parseTokenAmount(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.replaceAll(",", "").match(/([\d.]+)\s*([kmb])?/i);
  if (!match?.[1]) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === "b" ? 1_000_000_000 : unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1;
  return Math.round(base * multiplier);
}

export function parseDurationAmount(value?: string): number {
  if (!value) return 0;
  const normalized = value.trim().toLowerCase();
  const minutesSeconds = normalized.match(/([\d.]+)m(?:(\d+(?:\.\d+)?)s)?/);
  if (minutesSeconds?.[1]) {
    return Number(minutesSeconds[1]) * 60_000 + Number(minutesSeconds[2] ?? 0) * 1000;
  }
  const match = normalized.match(/([\d.]+)\s*(ms|s|m|h)?/);
  if (!match?.[1]) return 0;
  const base = Number(match[1]);
  const unit = match[2] ?? "ms";
  if (unit === "h") return base * 3_600_000;
  if (unit === "m") return base * 60_000;
  if (unit === "s") return base * 1000;
  return base;
}

export function rtkAvoidedCostRate(pricing: PricingResponse): number {
  return pricing.models["gpt-5.5"]?.inputPerMillion ?? pricing.models["gpt-5"]?.inputPerMillion ?? Object.values(pricing.models)[0]?.inputPerMillion ?? 5;
}

export function estimateAvoidedCostUsd(tokensAvoided: number | undefined, pricing: PricingResponse): number | undefined {
  if (tokensAvoided === undefined) return undefined;
  return Number(((tokensAvoided / 1_000_000) * rtkAvoidedCostRate(pricing)).toFixed(6));
}

export function readableCommandName(command: string): string {
  return command.replace(/\s+/g, " ").trim();
}

export function shortCommand(command: string): string {
  const readable = readableCommandName(command);
  return readable.length > 96 ? `${readable.slice(0, 96)}...` : readable;
}

export function readableIssueLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function sortedRtkCommands(commands: RtkCommand[], sort: { key: RtkCommandSortKey; direction: SortDirection }): RtkCommand[] {
  return [...commands].sort((a, b) => {
    let value = 0;
    if (sort.key === "command") value = a.command.localeCompare(b.command);
    if (sort.key === "count") value = (a.count ?? 0) - (b.count ?? 0);
    if (sort.key === "saved") value = (parseTokenAmount(a.saved) ?? 0) - (parseTokenAmount(b.saved) ?? 0);
    if (sort.key === "reduction") value = (a.averageSavedPercent ?? -1) - (b.averageSavedPercent ?? -1);
    if (sort.key === "runtime") value = parseDurationAmount(a.time) - parseDurationAmount(b.time);
    return sort.direction === "asc" ? value : -value;
  });
}

export function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function parseRecentRtkCommand(line: string): { time?: string; command: string; savings?: string } {
  const [time, rest = line] = line.split("•").map((part) => part.trim());
  const savings = rest.match(/(-?\d+(?:\.\d+)?%\s*\([^)]+\))$/)?.[1];
  const command = savings ? rest.slice(0, -savings.length).trim() : rest;
  return {
    ...(time && time !== rest ? { time } : {}),
    command: readableCommandName(command),
    ...(savings ? { savings } : {}),
  };
}

export function rtkRecommendedActions({
  gain,
  topCommand,
  commandsProcessed,
  savingsRate,
  coverageGaps,
}: {
  gain: RtkGain;
  topCommand: RtkCommand | undefined;
  commandsProcessed: number | undefined;
  savingsRate: number | undefined;
  coverageGaps: RtkCoverageGap[];
}): string[] {
  const actions: string[] = [];
  const topGap = [...coverageGaps].sort((a, b) => (parseTokenAmount(b.estimatedSavings) ?? 0) - (parseTokenAmount(a.estimatedSavings) ?? 0))[0];
  if (topGap) {
    actions.push(`${topGap.command} is the biggest discovered coverage gap; use ${topGap.rtkEquivalent ?? "the matching RTK wrapper"} when possible.`);
  } else if (gain.rtkDiscoverAvailable === false) {
    actions.push("Coverage discovery could not run locally, so RepoSpend can only show RTK gain data for now.");
  }
  if (gain.rtkCodexHookStatus === "unknown" || gain.rtkCodexHookStatus === undefined) {
    actions.push("Codex hook status is unknown; check RTK hook setup if Codex commands are not being compressed.");
  }
  if (topCommand?.count && topCommand.count >= 25) {
    actions.push(`${readableCommandName(topCommand.command)} appears often; review whether agents are repeating that command more than needed.`);
  }
  if (commandsProcessed && savingsRate !== undefined && savingsRate >= 50) {
    actions.push("RTK savings are high, so your local command proxy setup appears to be working well.");
  }
  return actions;
}

export function sessionPositiveSignals(session: Session): string[] {
  const items: string[] = [];
  if ((session.fileEditCount ?? 0) > 0) items.push(`${count(session.fileEditCount ?? 0, "file edit")} detected.`);
  if (importantCommandFailures(session) === 0) items.push("No possible failed commands detected.");
  if (session.parseStatus === "ok") items.push("Local session log parsed cleanly.");
  if (session.tokenConfidence === "high") items.push("Token counting confidence is high.");
  if (session.inputTokens > 0 && session.cachedInputTokens / session.inputTokens >= 0.5) items.push("Cached input reuse was strong.");
  if (session.repoRoot && !session.repoRoot.includes("unverified")) items.push("Session resolved to a repo or folder.");
  return items;
}

export function sessionConcernSignals(session: Session): string[] {
  const items: string[] = [];
  const commandIssues = importantCommandFailures(session);
  if (commandIssues > 0) items.push(`${count(commandIssues, "possible failed command")} to review.`);
  if (session.sessionOutcome === "partial" || session.sessionOutcome === "failed") items.push(`Outcome is ${outcomeLabel(session.sessionOutcome).toLowerCase()}; check whether the work completed.`);
  if ((session.fileEditCount ?? 0) === 0 && session.totalTokens > 1_000_000) items.push("High-token session with no detected file edits.");
  if (session.estimatedCostUsd === undefined && session.totalTokens > 0) items.push("API-equivalent cost unavailable because pricing or token split is missing.");
  if (session.parseStatus && session.parseStatus !== "ok") items.push("Parser reported issues for this session.");
  if (session.detectedSurface === "unknown") items.push("Surface could not be detected from local logs.");
  if (session.repoName.toLowerCase().includes("unknown") || session.warnings.includes("repo_unverified_no_git_root")) items.push("Repo/folder grouping is unverified because no Git root was detected.");
  if ((session.tokenSnapshotCount ?? 0) === 0 && session.totalTokens === 0) items.push("No token checkpoints were available.");
  return items;
}
