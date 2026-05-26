import type { HealthSignal, KeyInsight, NormalizedUsage, RepoUsageRollup, Summary, UsageGroup, UsageHealth, WasteSignal } from "@repospend/types";

export type { HealthSignal, HealthTone, KeyInsight, UsageHealth, WasteSignal } from "@repospend/types";

export interface UsageHealthInput {
  sessions: NormalizedUsage[];
  summary: Summary;
  repos: RepoUsageRollup[];
  sourceApps: UsageGroup[];
  scan: { repoCount: number; sessionCount: number; sourceAppCount: number; zeroTokenSessionCount: number };
}

export function buildUsageHealth(input: UsageHealthInput): UsageHealth {
  const signals = buildHealthSignals(input);
  const affectedSessionCount = new Set(signals.flatMap((signal) => signal.affectedSessionIds)).size;
  return {
    keyInsights: buildKeyInsights(input),
    signals,
    wasteSignals: buildWasteSignals(input.sessions),
    healthyCount: signals.filter((signal) => signal.tone === "good").length,
    attentionCount: signals.filter((signal) => signal.tone === "attention").length,
    criticalCount: signals.filter((signal) => signal.critical).length,
    affectedSessionCount,
  };
}

function buildKeyInsights({ sessions, summary, repos, sourceApps }: UsageHealthInput): KeyInsight[] {
  const insights: KeyInsight[] = [];
  const topTokenRepo = [...repos].sort((a, b) => b.totalTokens - a.totalTokens)[0];
  const topCostRepo = [...repos].filter((repo) => repo.estimatedCostUsd !== undefined).sort((a, b) => (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0))[0];
  const mostUsedApp = sourceApps[0];
  const mostExpensiveSession = [...sessions].filter((session) => session.estimatedCostUsd !== undefined).sort((a, b) => (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0))[0];

  if (topTokenRepo) insights.push({ label: "Most-used repo", text: `${topTokenRepo.label} used the most tokens in this period.`, metric: tokens(topTokenRepo.totalTokens), tone: "neutral" });
  if (topCostRepo) insights.push({ label: "Highest API-equivalent cost", text: `${topCostRepo.label} had the highest estimated API-equivalent cost.`, metric: money(topCostRepo.estimatedCostUsd), tone: "attention" });
  if (summary.noCodeChangeSessions === 0 && summary.sessionCount > 0) {
    insights.push({ label: "No-edit sessions", text: "No no-edit sessions were detected.", metric: "0", tone: "good" });
  } else if (summary.noCodeChangeSessions > 0) {
    insights.push({ label: "No-edit sessions", text: `${count(summary.noCodeChangeSessions, "session")} used tokens without detected file edits.`, metric: count(summary.noCodeChangeSessions, "session"), tone: "attention" });
  }
  if (mostUsedApp) insights.push({ label: "Most-used app", text: `${mostUsedApp.label} accounts for most detected local Codex usage.`, metric: tokens(mostUsedApp.totalTokens), tone: "neutral" });
  if (summary.inputTokens > 0) {
    const tone = summary.cachedInputPct >= 0.5 ? "good" : "attention";
    insights.push({ label: "Cache reuse", text: `Cached input represents ${percent(summary.cachedInputPct)} of input tokens.`, metric: percent(summary.cachedInputPct), tone });
  }
  if (mostExpensiveSession) {
    insights.push({ label: "Session to inspect", text: `The most expensive session was ${money(mostExpensiveSession.estimatedCostUsd)} API-equivalent.`, metric: money(mostExpensiveSession.estimatedCostUsd), tone: "attention" });
  }
  return insights.slice(0, 6);
}

function buildHealthSignals(input: UsageHealthInput): HealthSignal[] {
  const context = healthSignalContext(input);
  return healthSignalDetectors.flatMap((detector) => {
    const signal = detector.detect(context);
    return signal ? [signal] : [];
  });
}

interface HealthSignalContext extends UsageHealthInput {
  topSession: NormalizedUsage | undefined;
  topSessionShare: number;
  totals: Pick<NormalizedUsage, "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens" | "totalTokens">;
  outputShare: number;
  unverifiedRepos: NormalizedUsage[];
  commandIssueSessions: NormalizedUsage[];
  unknownSurfaceSessions: NormalizedUsage[];
  unknownCostSessions: NormalizedUsage[];
  parseFailureSessions: NormalizedUsage[];
  noCodeSessions: NormalizedUsage[];
  commandIssueRate: number;
  noCodeRate: number;
}

interface HealthSignalDetector {
  id: HealthSignal["id"];
  detect(context: HealthSignalContext): HealthSignal | undefined;
}

function healthSignalContext(input: UsageHealthInput): HealthSignalContext {
  const { sessions, summary } = input;
  const totalKnownCost = sessions.reduce((sum, session) => sum + (session.estimatedCostUsd ?? 0), 0);
  const topSession = [...sessions].filter((session) => session.estimatedCostUsd !== undefined).sort((a, b) => (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0))[0];
  const topSessionShare = topSession?.estimatedCostUsd && totalKnownCost > 0 ? topSession.estimatedCostUsd / totalKnownCost : 0;
  const totals = tokenTotals(sessions);
  return {
    ...input,
    topSession,
    topSessionShare,
    totals,
    outputShare: totals.totalTokens > 0 ? totals.outputTokens / totals.totalTokens : 0,
    unverifiedRepos: sessions.filter((session) => session.warnings.includes("repo_unverified_no_git_root")),
    commandIssueSessions: sessions.filter((session) => importantCommandFailures(session) > 0),
    unknownSurfaceSessions: sessions.filter((session) => session.detectedSurface === "unknown"),
    unknownCostSessions: sessions.filter((session) => session.estimatedCostUsd === undefined),
    parseFailureSessions: sessions.filter((session) => session.parseStatus === "failed" || (session.parseErrors?.length ?? 0) > 0),
    noCodeSessions: sessions.filter((session) => session.fileEditCount === 0),
    commandIssueRate: summary.shellCommandCount > 0 ? (summary.importantCommandFailures || summary.failedToolCallCount) / summary.shellCommandCount : 0,
    noCodeRate: summary.sessionCount > 0 ? summary.noCodeChangeSessions / summary.sessionCount : 0,
  };
}

const healthSignalDetectors: HealthSignalDetector[] = [
  {
    id: "repo-grouping",
    detect({ scan }) {
      if (scan.repoCount <= 0) return undefined;
      return {
      id: "repo-grouping",
      tone: "good",
      title: "Repo grouping is working",
      detail: `RepoSpend discovered ${count(scan.repoCount, "repo")} and merges nested working directories into repo roots.`,
      metric: count(scan.sessionCount, "session"),
      affectedSessionIds: [],
      };
    },
  },
  {
    id: "app-attribution",
    detect({ scan }) {
      if (scan.sourceAppCount <= 1) return undefined;
      return {
      id: "app-attribution",
      tone: "good",
      title: "App attribution is visible",
      detail: `Usage is split across ${count(scan.sourceAppCount, "source app")}, so VS Code, terminal, and subagent activity can be compared.`,
      metric: count(scan.sourceAppCount, "app"),
      affectedSessionIds: [],
      };
    },
  },
  {
    id: "priced-sessions",
    detect({ summary }) {
      if (summary.unknownCostSessions !== 0 || summary.sessionCount <= 0) return undefined;
      return {
      id: "priced-sessions",
      tone: "good",
      title: "All loaded sessions are priced",
      detail: "Every filtered session with tokens matched the local pricing table and has an API-equivalent cost estimate.",
      metric: `${compactNumber(summary.sessionCount)} priced`,
      affectedSessionIds: [],
      };
    },
  },
  {
    id: "cache-reuse",
    detect({ summary }) {
      if (summary.cachedInputPct < 0.75) return undefined;
      return {
      id: "cache-reuse",
      tone: "good",
      title: "Cache reuse is strong",
      detail: "Most input tokens are cached, which usually means repeated project context is being reused efficiently.",
      metric: percent(summary.cachedInputPct),
      affectedSessionIds: [],
      };
    },
  },
  {
    id: "token-roi-measurable",
    detect({ summary }) {
      if (summary.fileEditCount <= 0 || summary.totalTokens <= 0) return undefined;
      return {
      id: "token-roi-measurable",
      tone: "good",
      title: "Token ROI can be measured",
      detail: "RepoSpend detected file edits in local events, so tokens per edit and no-edit sessions can be tracked.",
      metric: `${tokens(Math.round(summary.totalTokens / summary.fileEditCount))} / edit`,
      affectedSessionIds: [],
      };
    },
  },
  {
    id: "empty-filter",
    detect({ summary }) {
      if (summary.sessionCount !== 0) return undefined;
      return {
      id: "empty-filter",
      tone: "attention",
      title: "No sessions in this view",
      detail: "The current filters do not include any token-bearing Codex sessions.",
      action: "Widen the date range or clear repo, app, and model filters.",
      affectedSessionIds: [],
      };
    },
  },
  {
    id: "command-friction",
    detect({ commandIssueRate, commandIssueSessions }) {
      if (commandIssueRate <= 0.2) return undefined;
      return {
      id: "command-friction",
      tone: "attention",
      title: "Possible failed command rate looks high",
      detail: `${percent(commandIssueRate)} of detected shell commands look like blocking, repeated, or token-expensive issues in this filtered view.`,
      action: "Look for repeated setup, dependency, permission, test, or build issues in the Sessions page.",
      actionTarget: "sessions",
      actionLabel: "Open affected sessions",
      metric: percent(commandIssueRate),
      affectedSessionIds: commandIssueSessions.map((session) => session.id),
      };
    },
  },
  {
    id: "no-code-sessions",
    detect({ noCodeRate, noCodeSessions, summary }) {
      if (noCodeRate <= 0.5 || summary.sessionCount < 3) return undefined;
      return {
      id: "no-code-sessions",
      tone: "attention",
      title: "Many sessions have no detected edits",
      detail: `${count(summary.noCodeChangeSessions, "session")} used tokens without detected file edits.`,
      action: "Some may be research-only, but high-token no-edit sessions are worth reviewing.",
      actionTarget: "sessions",
      actionLabel: "Open affected sessions",
      metric: percent(noCodeRate),
      affectedSessionIds: noCodeSessions.map((session) => session.id),
      };
    },
  },
  {
    id: "unknown-surfaces",
    detect({ unknownSurfaceSessions }) {
      if (unknownSurfaceSessions.length === 0) return undefined;
      return {
      id: "unknown-surfaces",
      tone: "attention",
      title: "Some surfaces are unknown",
      detail: `${count(unknownSurfaceSessions.length, "session")} did not expose enough local metadata to classify VS Code, terminal, exec, or app usage.`,
      action: "Open Sessions and check the surface reason column for those sessions.",
      actionTarget: "sessions",
      actionLabel: "Open affected sessions",
      metric: count(unknownSurfaceSessions.length, "session"),
      affectedSessionIds: unknownSurfaceSessions.map((session) => session.id),
      };
    },
  },
  {
    id: "parse-failures",
    detect({ parseFailureSessions }) {
      if (parseFailureSessions.length === 0) return undefined;
      return {
      id: "parse-failures",
      tone: "attention",
      title: "Some session files parsed partially",
      detail: `${count(parseFailureSessions.length, "session")} had parse errors or unreadable local log data.`,
      action: "Check Local Data Coverage and the Sessions parse column before trusting derived command/file metrics.",
      actionTarget: "settings",
      actionLabel: "View data sources",
      metric: count(parseFailureSessions.length, "issue"),
      critical: true,
      affectedSessionIds: parseFailureSessions.map((session) => session.id),
      };
    },
  },
  {
    id: "unknown-cost",
    detect({ unknownCostSessions }) {
      if (unknownCostSessions.length === 0) return undefined;
      return {
      id: "unknown-cost",
      tone: "attention",
      title: "Some sessions cannot be priced",
      detail: `${count(unknownCostSessions.length, "session")} are missing a model price or detailed token split.`,
      action: "Review the affected sessions first. Add a model rate only when the session has token details but no usable price.",
      actionTarget: "sessions",
      actionLabel: "Review unpriced sessions",
      metric: count(unknownCostSessions.length, "session"),
      critical: true,
      affectedSessionIds: unknownCostSessions.map((session) => session.id),
      };
    },
  },
  {
    id: "low-cache",
    detect({ sessions, summary, totals }) {
      if (totals.inputTokens <= 0 || summary.cachedInputPct >= 0.5) return undefined;
      return {
      id: "low-cache",
      tone: "attention",
      title: "Cache rate could be better",
      detail: "A low cached-input share usually means repeated context is being resent as fresh input.",
      action: "Prefer continuing existing sessions for related work and avoid repeatedly pasting large project context.",
      metric: percent(summary.cachedInputPct),
      affectedSessionIds: sessions.map((session) => session.id),
      };
    },
  },
  {
    id: "output-heavy",
    detect({ outputShare, sessions }) {
      if (outputShare <= 0.35) return undefined;
      return {
      id: "output-heavy",
      tone: "attention",
      title: "Output-heavy sessions are driving tokens",
      detail: "A large share of tokens are assistant output, which can happen with broad generation, long reviews, or verbose command output.",
      action: "Ask for concise diffs, summaries, or scoped files when the task does not need full output.",
      metric: percent(outputShare),
      affectedSessionIds: sessions.filter((session) => session.outputTokens / Math.max(session.totalTokens, 1) > 0.35).map((session) => session.id),
      };
    },
  },
  {
    id: "cost-concentration",
    detect({ topSession, topSessionShare }) {
      if (topSessionShare <= 0.35 || !topSession) return undefined;
      return {
      id: "cost-concentration",
      tone: "attention",
      title: "Spend is concentrated in one session",
      detail: `"${topSession.title ?? topSession.id}" accounts for a large share of estimated API-equivalent cost in this view.`,
      action: "Inspect that session and consider splitting very broad work into smaller passes.",
      metric: percent(topSessionShare),
      affectedSessionIds: [topSession.id],
      };
    },
  },
  {
    id: "unverified-repos",
    detect({ unverifiedRepos }) {
      if (unverifiedRepos.length === 0) return undefined;
      return {
      id: "unverified-repos",
      tone: "attention",
      title: "Some repos are unverified",
      detail: `${count(unverifiedRepos.length, "session")} did not resolve to a Git root, so grouping may be less precise.`,
      action: "Add repo aliases in repospend.config.json or run Codex from inside Git worktrees.",
      actionTarget: "settings",
      actionLabel: "View data sources",
      metric: count(unverifiedRepos.length, "session"),
      affectedSessionIds: unverifiedRepos.map((session) => session.id),
      };
    },
  },
  {
    id: "zero-token-skipped",
    detect({ scan }) {
      if (scan.zeroTokenSessionCount <= 0) return undefined;
      return {
      id: "zero-token-skipped",
      tone: "attention",
      title: "Zero-token placeholders were skipped",
      detail: `${count(scan.zeroTokenSessionCount, "local Codex record")} had no token usage and were excluded from analytics.`,
      action: "This is usually harmless, but it explains why raw local session counts may differ from dashboard counts.",
      metric: `${compactNumber(scan.zeroTokenSessionCount)} skipped`,
      affectedSessionIds: [],
      };
    },
  },
];

function buildWasteSignals(sessions: NormalizedUsage[]): WasteSignal[] {
  return wasteSignalDetectors.flatMap((detector) => {
    const signal = detector.detect(sessions);
    return signal ? [signal] : [];
  });
}

interface WasteSignalDetector {
  id: WasteSignal["id"];
  detect(sessions: NormalizedUsage[]): WasteSignal | undefined;
}

const wasteSignalDetectors: WasteSignalDetector[] = [
  wasteSignalDetector("high-token-no-edit", "High-token no-edit sessions", "Large sessions where local events did not show file edits.", (session) => (session.fileEditCount ?? 0) === 0 && session.totalTokens >= 1_000_000),
  wasteSignalDetector("high-token-low-output", "High-token low-output sessions", "Large sessions where most tokens were input or cached context.", (session) => session.totalTokens >= 1_000_000 && session.outputTokens / Math.max(session.totalTokens, 1) < 0.03),
  wasteSignalDetector("command-issue-sessions", "Possible failed command sessions", "Sessions with blocking, repeated, or token-expensive command failures.", (session) => importantCommandFailures(session) > 0),
  wasteSignalDetector("unknown-repos", "Unknown repo sessions", "Repo root could not be verified from local Git metadata.", (session) => session.warnings.includes("repo_unverified_no_git_root")),
  wasteSignalDetector("unknown-surfaces", "Unknown surface sessions", "Local logs did not identify VS Code, terminal, exec, or app surface.", (session) => (session.detectedSurface ?? "unknown") === "unknown"),
  wasteSignalDetector("repeated-errors", "Repeated error signals", "Repeated-error hints found in session warnings.", (session) => session.warnings.some((warning) => warning.includes("repeated_error"))),
];

function wasteSignalDetector(id: string, title: string, detail: string, matches: (session: NormalizedUsage) => boolean): WasteSignalDetector {
  return {
    id,
    detect(sessions) {
      const affected = sessions.filter(matches);
      if (affected.length === 0) return undefined;
      return {
        id,
        title,
        value: count(affected.length, "session"),
        detail,
        tone: "attention",
        affectedSessionIds: affected.map((session) => session.id),
      };
    },
  };
}

function importantCommandFailures(session: NormalizedUsage): number {
  return session.importantCommandFailures ?? session.failedToolCallCount ?? 0;
}

function tokenTotals(sessions: NormalizedUsage[]): Pick<NormalizedUsage, "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens" | "totalTokens"> {
  return sessions.reduce(
    (totals, session) => ({
      inputTokens: totals.inputTokens + session.inputTokens,
      cachedInputTokens: totals.cachedInputTokens + session.cachedInputTokens,
      outputTokens: totals.outputTokens + session.outputTokens,
      reasoningTokens: totals.reasoningTokens + session.reasoningTokens,
      totalTokens: totals.totalTokens + session.totalTokens,
    }),
    { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
  );
}

function money(value?: number): string {
  if (value === undefined) return "Not priced";
  if (value > 0 && value < 0.01) return "<$0.01 USD";
  return `${currency(value, 2, 2)} USD`;
}

function tokens(value: number): string {
  return `${compactNumber(value)} ${pluralize("token", value)}`;
}

function count(value: number, noun: string): string {
  return `${compactNumber(value)} ${pluralize(noun, value)}`;
}

function percent(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const units = [
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];
  const unit = units.find((item) => absolute >= item.threshold);
  if (!unit) return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
  const scaled = absolute / unit.threshold;
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(scaled);
  return `${sign}${formatted}${unit.suffix}`;
}

function currency(value: number, minimumFractionDigits: number, maximumFractionDigits: number): string {
  return `$${new Intl.NumberFormat(undefined, { maximumFractionDigits, minimumFractionDigits }).format(value)}`;
}

function pluralize(noun: string, value: number): string {
  if (value === 1) return noun;
  if (noun.endsWith("s")) return noun;
  return `${noun}s`;
}
