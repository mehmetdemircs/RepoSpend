import { buildDashboardSnapshot, calculateCostUsd, defaultPricing } from "@repospend/core";
import type { DashboardSnapshot, DashboardSourceStats, NormalizedUsage, RtkGain, SourceStatus, UsageFilters } from "@repospend/types";

const baseDate = "2026-05-18";
const demoPricing = {
  ...defaultPricing,
  "gpt-5.3-codex": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14, reasoningOutputPerMillion: 14 },
  "gpt-5.3-codex-spark": { inputPerMillion: 1.75, cachedInputPerMillion: 0.175, outputPerMillion: 14, reasoningOutputPerMillion: 14 },
  "claude-haiku-4-5-20251001": { inputPerMillion: 1, cacheCreationInputPerMillion: 1.25, cachedInputPerMillion: 0.1, outputPerMillion: 5 },
};

type DemoSessionInput = {
  id: string;
  repo: string;
  title: string;
  sourceClient: NormalizedUsage["sourceClient"];
  sourceApp: string;
  sourceAppRaw?: string;
  model: string;
  provider: string;
  hour: number;
  minute: number;
  durationMinutes: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  prompts: number;
  replies: number;
  tools: number;
  commands: number;
  edits: number;
  reads: number;
  outcome: NormalizedUsage["sessionOutcome"];
  branch: string;
  warnings?: string[];
  importantFailures?: number;
  harmlessNonZero?: number;
  exploratoryMisses?: number;
  repeatedClusters?: number;
  topFailureType?: NormalizedUsage["topFailureType"];
  issueSamples?: NormalizedUsage["commandIssueSamples"];
  detectedSurface?: NormalizedUsage["detectedSurface"];
  tokenConfidence?: NormalizedUsage["tokenConfidence"];
};

export function demoModeEnabled(): boolean {
  return process.env.REPOSPEND_DEMO_DATA === "lotr";
}

export function readDemoDashboardData(filters: UsageFilters = {}): DashboardSnapshot {
  return buildDashboardSnapshot({
    sources: demoSources,
    sourceStats: demoSourceStats,
    sessions: demoSessions,
    filters,
  });
}

export function readDemoRtkGain(): RtkGain {
  return {
    available: true,
    rtkDetected: true,
    rtkVersion: "rtk-demo 1.0.0",
    rtkCodexHookStatus: "active",
    rtkLastActivityAt: "2026-05-18T18:42:00.000Z",
    rtkDataSource: "fictional demo data",
    totalCommands: 248,
    inputTokens: "18.4M",
    outputTokens: "2.6M",
    tokensSaved: "5.8M",
    savedPercent: 23.9,
    totalExecTime: "41m",
    averageExecTime: "9.9s",
    rtkTokensSaved: "5.8M",
    rtkSavingsRate: 23.9,
    rtkCommandsProcessed: 248,
    rtkAverageCommandRuntime: "9.9s",
    rtkTopSavingsCommands: [
      { command: "rg", count: 74, saved: "1.9M", averageSavedPercent: 31.2, time: "8m" },
      { command: "pnpm test", count: 18, saved: "840K", averageSavedPercent: 17.4, time: "12m" },
      { command: "git diff", count: 39, saved: "620K", averageSavedPercent: 26.8, time: "2m" },
    ],
    rtkRecentActivity: [
      "rg council-of-elrond planner",
      "pnpm test --filter gondor-api",
      "git diff -- shire-mobile",
    ],
    rtkDiscoverAvailable: true,
    rtkDiscoverError: undefined,
    rtkDiscoverSummary: "Total: 248 fictional command events scanned.",
    rtkCoverageGaps: [
      { command: "cat", count: 21, rtkEquivalent: "rtk sed", status: "easy win", estimatedSavings: "410K" },
      { command: "grep", count: 13, rtkEquivalent: "rtk rg", status: "easy win", estimatedSavings: "360K" },
    ],
    rtkUnhandledCommands: [
      { command: "palantirctl inspect", count: 5, example: "palantirctl inspect eye-of-sauron-alerts" },
    ],
    topCommands: [
      { command: "rg", count: 74, saved: "1.9M", averageSavedPercent: 31.2, time: "8m" },
      { command: "git", count: 46, saved: "720K", averageSavedPercent: 18.3, time: "3m" },
      { command: "pnpm", count: 31, saved: "1.1M", averageSavedPercent: 16.8, time: "17m" },
    ],
    recentCommands: [
      "rtk rg auth gates-of-moria",
      "rtk pnpm test --filter palantir-observability",
      "rtk git diff -- one-ring-infra",
    ],
    raw: "RepoSpend LOTR demo RTK output",
    error: undefined,
  };
}

const demoSources: SourceStatus[] = [
  {
    id: "codex",
    label: "Codex",
    available: true,
    paths: ["/demo/middle-earth/codex/state.sqlite", "/demo/middle-earth/codex/sessions"],
    warnings: [],
  },
  {
    id: "claude",
    label: "Claude Code",
    available: true,
    paths: ["/demo/middle-earth/claude/projects"],
    warnings: [],
  },
];

const demoSourceStats: DashboardSourceStats[] = [
  {
    sourceId: "codex",
    sourceLabel: "Codex",
    homePath: "/demo/middle-earth/codex",
    statePath: "/demo/middle-earth/codex/state.sqlite",
    sessionsPath: "/demo/middle-earth/codex/sessions",
    stateExists: true,
    sessionsExists: true,
    sessionFileCount: 15,
    sessionsImported: 15,
    parseFailureCount: 0,
    unreadableFileCount: 0,
    malformedFileCount: 0,
    lastScannedAt: "2026-05-18T19:00:00.000Z",
  },
  {
    sourceId: "claude",
    sourceLabel: "Claude Code",
    homePath: "/demo/middle-earth/claude",
    projectsPath: "/demo/middle-earth/claude/projects",
    projectsExists: true,
    sessionFileCount: 7,
    sessionsImported: 7,
    parseFailureCount: 0,
    unreadableFileCount: 0,
    malformedFileCount: 0,
    projectDirCount: 4,
    lastScannedAt: "2026-05-18T19:01:00.000Z",
  },
];

const demoInputs: DemoSessionInput[] = [
  {
    id: "lotr-session-001",
    repo: "one-ring-infra",
    title: "Why is one-ring-infra spending 3x more than shire-mobile?",
    sourceClient: "codex",
    sourceApp: "Codex app",
    model: "GPT-5.5",
    provider: "openai",
    hour: 9,
    minute: 10,
    durationMinutes: 84,
    inputTokens: 2_850_000,
    cachedInputTokens: 320_000,
    outputTokens: 410_000,
    reasoningTokens: 260_000,
    prompts: 9,
    replies: 18,
    tools: 86,
    commands: 34,
    edits: 3,
    reads: 92,
    outcome: "completed",
    branch: "audit/token-fire",
    importantFailures: 2,
    harmlessNonZero: 4,
    repeatedClusters: 1,
    topFailureType: "test",
    warnings: ["repeated_error:test-suite"],
    issueSamples: [
      issue("pnpm test --filter one-ring-infra", "test", "warning", "medium", "Repeated failing shard while auditing token spend."),
      issue("terraform plan -var region=mordor", "deploy", "critical", "high", "Infrastructure plan failed before the safer dry-run path was found."),
    ],
  },
  {
    id: "lotr-session-002",
    repo: "mordor-ci",
    title: "Reduce token burn in mordor-ci",
    sourceClient: "codex",
    sourceApp: "Codex app",
    model: "GPT-5.4",
    provider: "openai",
    hour: 10,
    minute: 35,
    durationMinutes: 62,
    inputTokens: 1_780_000,
    cachedInputTokens: 95_000,
    outputTokens: 280_000,
    reasoningTokens: 185_000,
    prompts: 7,
    replies: 12,
    tools: 58,
    commands: 28,
    edits: 2,
    reads: 51,
    outcome: "partial",
    branch: "ci/doom-cache",
    importantFailures: 3,
    harmlessNonZero: 1,
    repeatedClusters: 2,
    topFailureType: "build",
    warnings: ["low_cache_rate"],
    issueSamples: [
      issue("pnpm build --filter mordor-ci", "build", "critical", "high", "Build failed repeatedly after the Mount Doom runner image changed."),
    ],
  },
  {
    id: "lotr-session-003",
    repo: "shire-mobile",
    title: "Investigate token spike after second breakfast",
    sourceClient: "claude",
    sourceApp: "Claude Code",
    sourceAppRaw: "claude-code",
    model: "claude-opus-4-7",
    provider: "anthropic",
    hour: 11,
    minute: 5,
    durationMinutes: 46,
    inputTokens: 1_420_000,
    cachedInputTokens: 210_000,
    outputTokens: 185_000,
    reasoningTokens: 0,
    prompts: 5,
    replies: 9,
    tools: 31,
    commands: 12,
    edits: 0,
    reads: 44,
    outcome: "research_only",
    branch: "analytics/second-breakfast",
    warnings: [],
    detectedSurface: "terminal_cli",
    tokenConfidence: "high",
  },
  {
    id: "lotr-session-004",
    repo: "palantir-observability",
    title: "Fix race condition in the palantir event stream",
    sourceClient: "codex",
    sourceApp: "VS Code",
    sourceAppRaw: "vscode",
    model: "GPT-5.4",
    provider: "openai",
    hour: 12,
    minute: 20,
    durationMinutes: 73,
    inputTokens: 1_260_000,
    cachedInputTokens: 455_000,
    outputTokens: 210_000,
    reasoningTokens: 170_000,
    prompts: 6,
    replies: 14,
    tools: 64,
    commands: 24,
    edits: 6,
    reads: 66,
    outcome: "completed",
    branch: "stream/palantir-race",
    importantFailures: 1,
    harmlessNonZero: 3,
    topFailureType: "test",
    issueSamples: [
      issue("pnpm test palantir-stream.spec.ts", "test", "warning", "medium", "One flaky stream-order assertion needed a deterministic clock."),
    ],
  },
  {
    id: "lotr-session-005",
    repo: "gondor-api",
    title: "Add auth flow for gates-of-moria",
    sourceClient: "codex",
    sourceApp: "Codex app",
    model: "GPT-5.4-Mini",
    provider: "openai",
    hour: 13,
    minute: 0,
    durationMinutes: 58,
    inputTokens: 860_000,
    cachedInputTokens: 280_000,
    outputTokens: 130_000,
    reasoningTokens: 74_000,
    prompts: 5,
    replies: 10,
    tools: 42,
    commands: 18,
    edits: 8,
    reads: 39,
    outcome: "completed",
    branch: "auth/mellon",
  },
  {
    id: "lotr-session-006",
    repo: "rivendell-dashboard",
    title: "Refactor the council-of-elrond planner",
    sourceClient: "claude",
    sourceApp: "Claude desktop local agent",
    sourceAppRaw: "claude-desktop-local-agent",
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    hour: 14,
    minute: 15,
    durationMinutes: 67,
    inputTokens: 920_000,
    cachedInputTokens: 360_000,
    outputTokens: 150_000,
    reasoningTokens: 0,
    prompts: 6,
    replies: 11,
    tools: 37,
    commands: 15,
    edits: 7,
    reads: 48,
    outcome: "completed",
    branch: "planner/elrond-v2",
  },
  {
    id: "lotr-session-007",
    repo: "palantir-observability",
    title: "Optimize observability for eye-of-sauron alerts",
    sourceClient: "codex",
    sourceApp: "Codex app",
    model: "GPT-5.3-Codex",
    provider: "openai",
    hour: 15,
    minute: 40,
    durationMinutes: 51,
    inputTokens: 740_000,
    cachedInputTokens: 290_000,
    outputTokens: 96_000,
    reasoningTokens: 88_000,
    prompts: 4,
    replies: 8,
    tools: 44,
    commands: 17,
    edits: 5,
    reads: 36,
    outcome: "completed",
    branch: "alerts/eye-slo",
    harmlessNonZero: 2,
    exploratoryMisses: 3,
  },
  {
    id: "lotr-session-008",
    repo: "mordor-ci",
    title: "Clean up dead code in orc-deployment-worker",
    sourceClient: "codex",
    sourceApp: "Terminal",
    sourceAppRaw: "terminal",
    model: "GPT-5.3-Codex-Spark",
    provider: "openai",
    hour: 16,
    minute: 10,
    durationMinutes: 39,
    inputTokens: 540_000,
    cachedInputTokens: 180_000,
    outputTokens: 84_000,
    reasoningTokens: 64_000,
    prompts: 3,
    replies: 7,
    tools: 35,
    commands: 14,
    edits: 9,
    reads: 31,
    outcome: "completed",
    branch: "workers/orc-cleanup",
    detectedSurface: "terminal_cli",
  },
  {
    id: "lotr-session-009",
    repo: "minas-tirith-admin",
    title: "Tighten city-gate roles before the beacons launch",
    sourceClient: "claude",
    sourceApp: "Claude Code",
    sourceAppRaw: "claude-code",
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    hour: 17,
    minute: 5,
    durationMinutes: 32,
    inputTokens: 390_000,
    cachedInputTokens: 120_000,
    outputTokens: 61_000,
    reasoningTokens: 0,
    prompts: 4,
    replies: 6,
    tools: 25,
    commands: 9,
    edits: 5,
    reads: 23,
    outcome: "completed",
    branch: "rbac/beacons",
  },
  {
    id: "lotr-session-010",
    repo: "fellowship-docs",
    title: "Document why nobody should commit the ring config",
    sourceClient: "codex",
    sourceApp: "Codex app",
    model: "GPT-5.2",
    provider: "openai",
    hour: 18,
    minute: 25,
    durationMinutes: 24,
    inputTokens: 210_000,
    cachedInputTokens: 75_000,
    outputTokens: 38_000,
    reasoningTokens: 22_000,
    prompts: 2,
    replies: 5,
    tools: 18,
    commands: 6,
    edits: 4,
    reads: 16,
    outcome: "completed",
    branch: "docs/ring-config",
  },
  {
    id: "lotr-session-011",
    repo: "one-ring-infra",
    title: "Cap runaway apply retries in black-gate provisioner",
    sourceClient: "codex",
    sourceApp: "Terminal",
    sourceAppRaw: "terminal",
    model: "GPT-5.4",
    provider: "openai",
    hour: 18,
    minute: 55,
    durationMinutes: 44,
    inputTokens: 980_000,
    cachedInputTokens: 140_000,
    outputTokens: 148_000,
    reasoningTokens: 96_000,
    prompts: 4,
    replies: 9,
    tools: 41,
    commands: 21,
    edits: 4,
    reads: 45,
    outcome: "completed",
    branch: "infra/black-gate-retries",
    importantFailures: 1,
    harmlessNonZero: 2,
    topFailureType: "deploy",
    detectedSurface: "terminal_cli",
    issueSamples: [
      issue("terraform apply -auto-approve", "deploy", "critical", "high", "The demo caught a risky retry loop and switched to a dry-run plan."),
    ],
  },
  {
    id: "lotr-session-012",
    repo: "rivendell-dashboard",
    title: "Make elvish table sorting less mysterious",
    sourceClient: "codex",
    sourceApp: "VS Code",
    sourceAppRaw: "vscode",
    model: "GPT-5.4-Mini",
    provider: "openai",
    hour: 19,
    minute: 20,
    durationMinutes: 29,
    inputTokens: 310_000,
    cachedInputTokens: 130_000,
    outputTokens: 49_000,
    reasoningTokens: 35_000,
    prompts: 3,
    replies: 6,
    tools: 22,
    commands: 8,
    edits: 3,
    reads: 18,
    outcome: "completed",
    branch: "tables/less-elvish",
  },
  {
    id: "lotr-session-013",
    repo: "gondor-api",
    title: "Trim noisy auth logs from white-tree callbacks",
    sourceClient: "codex",
    sourceApp: "Codex app",
    model: "GPT-5.3-Codex",
    provider: "openai",
    hour: 20,
    minute: 5,
    durationMinutes: 35,
    inputTokens: 420_000,
    cachedInputTokens: 160_000,
    outputTokens: 66_000,
    reasoningTokens: 54_000,
    prompts: 3,
    replies: 6,
    tools: 28,
    commands: 11,
    edits: 4,
    reads: 27,
    outcome: "completed",
    branch: "logs/white-tree",
  },
  {
    id: "lotr-session-014",
    repo: "shire-mobile",
    title: "Make pantry sync work offline in Bag End",
    sourceClient: "claude",
    sourceApp: "Claude Code",
    sourceAppRaw: "claude-code",
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    hour: 20,
    minute: 45,
    durationMinutes: 28,
    inputTokens: 260_000,
    cachedInputTokens: 90_000,
    outputTokens: 42_000,
    reasoningTokens: 0,
    prompts: 3,
    replies: 5,
    tools: 19,
    commands: 7,
    edits: 5,
    reads: 17,
    outcome: "completed",
    branch: "offline/bag-end",
  },
];

const demoSessions = demoInputs.map(toSession);

function toSession(input: DemoSessionInput): NormalizedUsage {
  const start = timestamp(input.hour, input.minute);
  const end = new Date(new Date(start).getTime() + input.durationMinutes * 60_000).toISOString();
  const repoRoot = `/demo/middle-earth/${input.repo}`;
  const totalTokens = input.inputTokens + input.outputTokens + input.reasoningTokens;
  const importantFailures = input.importantFailures ?? 0;
  const harmlessNonZero = input.harmlessNonZero ?? 0;
  const exploratoryMisses = input.exploratoryMisses ?? 0;
  const repeatedClusters = input.repeatedClusters ?? 0;
  const failedToolCalls = importantFailures + repeatedClusters;
  const nonZeroCommandEvents = importantFailures + harmlessNonZero + exploratoryMisses;
  const cost = calculateCostUsd({
    model: input.model,
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
    reasoningTokens: input.reasoningTokens,
  }, demoPricing);

  return {
    id: input.id,
    sourceClient: input.sourceClient,
    sourceApp: input.sourceApp,
    sourceAppRaw: input.sourceAppRaw ?? input.sourceApp.toLowerCase(),
    sourcePath: `/demo/middle-earth/${input.sourceClient}/sessions/${input.id}.jsonl`,
    repoRoot,
    repoName: input.repo,
    cwd: `${repoRoot}/worktree`,
    gitRemoteUrl: `https://example.invalid/middle-earth/${input.repo}.git`,
    gitBranch: input.branch,
    title: input.title,
    startedAt: start,
    endedAt: end,
    model: input.model,
    provider: input.provider,
    durationMs: input.durationMinutes * 60_000,
    rawEventCount: input.tools + input.replies + input.prompts + 8,
    parseStatus: "ok",
    parseErrors: [],
    detectedSurface: input.detectedSurface ?? detectedSurfaceForApp(input.sourceApp),
    surfaceConfidence: "high",
    surfaceReason: "Demo fixture includes an explicit fictional source app.",
    promptTimeline: [
      { role: "user", text: input.title, timestamp: start },
      { role: "assistant", text: demoReply(input.repo, input.edits, importantFailures), timestamp: timestamp(input.hour, Math.min(input.minute + 7, 59)) },
    ],
    sessionOutcome: input.outcome,
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
    reasoningTokens: input.reasoningTokens,
    reasoningOutputTokens: input.reasoningTokens,
    totalTokens,
    tokenAggregationMethod: "direct_usage",
    tokenConfidence: input.tokenConfidence ?? "high",
    tokenSnapshotCount: Math.max(2, Math.round(input.durationMinutes / 18)),
    estimatedCostUsd: cost,
    messageCount: input.prompts + input.replies,
    rawTokenTotal: totalTokens,
    warnings: input.warnings ?? [],
    userPromptCount: input.prompts,
    assistantMessageCount: input.replies,
    toolCallCount: input.tools,
    shellCommandCount: input.commands,
    failedToolCallCount: failedToolCalls,
    nonZeroCommandEvents,
    importantCommandFailures: importantFailures,
    harmlessNonZeroEvents: harmlessNonZero,
    exploratoryMisses,
    repeatedFailureClusters: repeatedClusters,
    commandIssueSeverity: importantFailures > 1 ? "critical" : importantFailures > 0 ? "warning" : "none",
    commandIssueImpact: importantFailures > 1 ? "high" : importantFailures > 0 ? "medium" : "none",
    topFailureType: input.topFailureType,
    commandIssueSamples: input.issueSamples ?? [],
    fileReadCount: input.reads,
    fileEditCount: input.edits,
  };
}

function detectedSurfaceForApp(sourceApp: string): NormalizedUsage["detectedSurface"] {
  if (sourceApp === "VS Code") return "vscode_extension";
  if (sourceApp === "Terminal") return "terminal_cli";
  if (sourceApp === "Codex app") return "codex_app_cloud";
  if (sourceApp === "Claude desktop local agent") return "local_agent";
  return "terminal_cli";
}

function timestamp(hour: number, minute: number): string {
  return `${baseDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function issue(
  command: string,
  category: NormalizedUsage["commandIssueSamples"][number]["category"],
  severity: NormalizedUsage["commandIssueSamples"][number]["severity"],
  impact: NormalizedUsage["commandIssueSamples"][number]["impact"],
  reason: string,
): NormalizedUsage["commandIssueSamples"][number] {
  return {
    command,
    category,
    classification: severity === "critical" ? "blocking_failure" : "warning",
    severity,
    impact,
    reason,
  };
}

function demoReply(repo: string, edits: number, importantFailures: number): string {
  if (importantFailures > 0) {
    return `Found the noisy path in ${repo}, separated the risky failures from ordinary exploration, and left a short list of follow-up checks.`;
  }
  if (edits === 0) {
    return `Mapped the spend pattern in ${repo} without changing files, which is exactly the kind of research-only trail RepoSpend should make visible.`;
  }
  return `Updated ${repo} with focused changes and enough local checks to make the token spend easy to explain.`;
}
