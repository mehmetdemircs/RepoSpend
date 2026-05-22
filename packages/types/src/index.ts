export type SourceClient = "codex" | "claude" | "cursor" | "opencode" | "gemini-cli" | "unknown";
export type TokenAggregationMethod = "final_snapshot" | "delta_sum" | "direct_usage" | "estimated" | "unknown";
export type TokenConfidence = "high" | "medium" | "low";
export type CommandIssueClassification = "blocking_failure" | "warning" | "harmless_nonzero" | "exploratory_miss" | "unknown";
export type CommandIssueSeverity = "critical" | "warning" | "info" | "ignored" | "none";
export type CommandIssueImpact = "high" | "medium" | "low" | "none";
export type CommandCategory = "build" | "test" | "lint" | "typecheck" | "install" | "deploy" | "git" | "search" | "filesystem" | "package_manager" | "dev_server" | "database" | "auth_env" | "unknown";

export interface CommandIssueSample {
  command: string;
  category: CommandCategory;
  classification: CommandIssueClassification;
  severity: CommandIssueSeverity;
  impact: CommandIssueImpact;
  reason: string;
}

export interface PromptTimelineItem {
  role: "user" | "assistant";
  text: string;
  timestamp?: string | undefined;
}

export interface SessionIdentity {
  id: string;
  sourceClient: SourceClient;
  sourceApp: string;
  sourceAppRaw: string | undefined;
  sourcePath: string;
  repoRoot: string;
  repoName: string;
  cwd: string;
  gitRemoteUrl: string | undefined;
  gitBranch: string | undefined;
  title: string | undefined;
  startedAt: string | undefined;
  endedAt: string | undefined;
  model: string | undefined;
  provider: string | undefined;
  codexHome?: string | undefined;
  durationMs?: number | undefined;
  rawEventCount?: number | undefined;
  parseStatus?: "ok" | "partial" | "failed" | undefined;
  parseErrors?: string[] | undefined;
  detectedSurface?: "terminal_cli" | "vscode_extension" | "local_agent" | "codex_exec" | "codex_app_cloud" | "unknown" | undefined;
  surfaceConfidence?: "high" | "medium" | "low" | undefined;
  surfaceReason?: string | undefined;
  promptTimeline?: PromptTimelineItem[] | undefined;
  sessionOutcome?: "completed" | "partial" | "failed" | "research_only" | "no_code_change" | "setup_debugging" | "unknown" | undefined;
  sourceMetadata?: Record<string, unknown> | undefined;
}

export interface TokenAggregation {
  /** Total input tokens reported for the session, including cached/read and cache-write input when the source reports those separately. */
  inputTokens: number;
  /** Input tokens served from cache. This is a subset of inputTokens when known. */
  cachedInputTokens: number;
  /** Input tokens written to cache. This is a subset of inputTokens when known. */
  cacheCreationInputTokens?: number | undefined;
  outputTokens: number;
  reasoningTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  tokenAggregationMethod: TokenAggregationMethod;
  tokenConfidence: TokenConfidence;
  tokenSnapshotCount: number;
  estimatedCostUsd: number | undefined;
  messageCount: number;
  rawTokenTotal: number | undefined;
  warnings: string[];
}

export interface AgentFrictionSignals {
  userPromptCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  shellCommandCount: number;
  failedToolCallCount: number;
  nonZeroCommandEvents: number;
  importantCommandFailures: number;
  harmlessNonZeroEvents: number;
  exploratoryMisses: number;
  repeatedFailureClusters: number;
  commandIssueSeverity: CommandIssueSeverity;
  commandIssueImpact: CommandIssueImpact;
  topFailureType: CommandCategory | CommandIssueClassification | undefined;
  commandIssueSamples: CommandIssueSample[];
  fileReadCount: number;
  fileEditCount: number;
}

export interface CompactionEvent {
  /** ISO timestamp of the compaction. */
  timestamp: string | undefined;
  /** "manual" when the user invoked /compact, "auto" when the agent compacted because context filled up. */
  trigger: "manual" | "auto";
}

export interface CompactionStats {
  /** Total compaction events observed in this session. */
  count: number;
  /** Compactions triggered automatically by the agent (e.g. context window pressure). */
  autoCount: number;
  /** Compactions triggered by the user (e.g. /compact). */
  manualCount: number;
  /** Individual compaction events with timestamps, when available. */
  events: CompactionEvent[];
}

export interface NormalizedSession extends SessionIdentity, TokenAggregation, AgentFrictionSignals {
  compaction?: CompactionStats | undefined;
}

export type NormalizedUsage = NormalizedSession;

export interface RepoBudget {
  repo: string;
  dailyUsd?: number;
  monthlyUsd?: number;
}

export interface RepoAlias {
  name: string;
  paths: string[];
}

export interface RepoSpendConfig {
  repos?: RepoAlias[];
  budgets?: RepoBudget[];
  pricingPath?: string;
}

export interface SourceStatus {
  id: SourceClient;
  label: string;
  available: boolean;
  paths: string[];
  warnings: string[];
}

export type UsageFilterValue = string | string[];

export interface UsageFilters {
  source?: UsageFilterValue;
  sourceApp?: UsageFilterValue;
  repo?: UsageFilterValue;
  model?: UsageFilterValue;
  from?: string;
  to?: string;
}

export interface UsageGroup {
  id: string;
  label: string;
  estimatedCostUsd: number | undefined;
  knownCostSessions: number;
  unknownCostSessions: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  sessionCount: number;
  messageCount: number;
  warnings: string[];
  verified?: boolean;
}

export interface Summary {
  estimatedCostUsd: number | undefined;
  knownCostSessions: number;
  totalTokens: number;
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputPct: number;
  sessionCount: number;
  repoCount: number;
  modelCount: number;
  mostExpensiveRepo: UsageGroup | undefined;
  unknownCostSessions: number;
  userPromptCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  shellCommandCount: number;
  failedToolCallCount: number;
  nonZeroCommandEvents: number;
  importantCommandFailures: number;
  harmlessNonZeroEvents: number;
  exploratoryMisses: number;
  repeatedFailureClusters: number;
  fileReadCount: number;
  fileEditCount: number;
  rawEventCount: number;
  parseFailureCount: number;
  unknownSurfaceSessions: number;
  noCodeChangeSessions: number;
  researchOnlySessions: number;
  warnings: string[];
}

export interface RepoUsageRollup extends UsageGroup {
  sessions: NormalizedUsage[];
  fileEditCount: number;
  failedCommandCount: number;
  tokenRoiTokensPerEdit: number | undefined;
  tokenRoiLabel: string;
  tokenRoiTitle: string;
}

export type HealthTone = "good" | "attention";

export interface HealthSignal {
  id: string;
  title: string;
  detail: string;
  tone: HealthTone;
  metric?: string;
  action?: string;
  actionTarget?: "dashboard" | "sessions" | "sessionDetail" | "repos" | "repoDetail" | "models" | "commands" | "insights" | "rtk" | "settings";
  actionLabel?: string;
  critical?: boolean;
  affectedSessionIds: string[];
}

export interface KeyInsight {
  label: string;
  text: string;
  metric?: string;
  tone?: "neutral" | "good" | "attention";
}

export interface WasteSignal {
  id: string;
  title: string;
  value: string;
  detail: string;
  tone: "attention";
  affectedSessionIds: string[];
}

export interface UsageHealth {
  keyInsights: KeyInsight[];
  signals: HealthSignal[];
  wasteSignals: WasteSignal[];
  healthyCount: number;
  attentionCount: number;
  criticalCount: number;
  affectedSessionCount: number;
}

export interface DashboardSourceStats {
  sourceId?: SourceClient;
  sourceLabel?: string;
  homePath?: string;
  codexHome?: string;
  claudeHome?: string;
  statePath?: string;
  sessionsPath?: string;
  projectsPath?: string;
  historyPath?: string;
  cursorHome?: string;
  globalStoragePath?: string;
  workspaceStoragePath?: string;
  stateExists?: boolean;
  sessionsExists?: boolean;
  projectsExists?: boolean;
  historyExists?: boolean;
  databaseFileCount?: number;
  skippedFileCount?: number;
  sessionFileCount: number;
  sessionsImported?: number;
  parseFailureCount?: number;
  unreadableFileCount?: number;
  malformedFileCount?: number;
  projectDirCount?: number;
  historyEntryCount?: number;
  lastScannedAt: string;
}

export interface ScanOverview {
  sessionCount: number;
  zeroTokenSessionCount: number;
  repoCount: number;
  modelCount: number;
  sourceAppCount: number;
  rawSessionCount: number;
  rawEventCount: number;
  parseFailureCount: number;
  sessionFileCount: number;
  lastScannedAt: string;
}

export interface DashboardSnapshot {
  sources: SourceStatus[];
  sourceStats: DashboardSourceStats[];
  scan: ScanOverview;
  sessions: NormalizedUsage[];
  skippedZeroTokenSessions: number;
  summary: Summary;
  repos: RepoUsageRollup[];
  days: UsageGroup[];
  hours: UsageGroup[];
  models: UsageGroup[];
  sourceApps: UsageGroup[];
  health: UsageHealth;
}

export interface ModelPricing {
  inputPerMillion: number;
  cachedInputPerMillion?: number;
  cacheCreationInputPerMillion?: number;
  outputPerMillion: number;
  reasoningOutputPerMillion?: number;
  note?: string;
}

export interface PricingInfo {
  sourceName: string;
  sourceUrl: string;
  sourceUrls?: Array<{ label: string; url: string }> | undefined;
  unit: string;
  updatedAt: string;
  note: string;
}

export interface PricingResponse {
  info: PricingInfo;
  path?: string;
  models: Record<string, ModelPricing>;
}

export interface RtkCommand {
  command: string;
  count: number | undefined;
  saved: string | undefined;
  averageSavedPercent: number | undefined;
  time: string | undefined;
}

export interface RtkCoverageGap {
  command: string;
  count: number | undefined;
  rtkEquivalent: string | undefined;
  status: string | undefined;
  estimatedSavings: string | undefined;
}

export interface RtkUnhandledCommand {
  command: string;
  count: number | undefined;
  example: string | undefined;
}

export interface RtkGain {
  available: boolean;
  rtkDetected: boolean;
  rtkVersion: string | undefined;
  rtkCodexHookStatus: "active" | "not_detected" | "unknown";
  rtkLastActivityAt: string | undefined;
  rtkDataSource: string | undefined;
  totalCommands: number | undefined;
  inputTokens: string | undefined;
  outputTokens: string | undefined;
  tokensSaved: string | undefined;
  savedPercent: number | undefined;
  totalExecTime: string | undefined;
  averageExecTime: string | undefined;
  rtkTokensSaved: string | undefined;
  rtkSavingsRate: number | undefined;
  rtkCommandsProcessed: number | undefined;
  rtkAverageCommandRuntime: string | undefined;
  rtkTopSavingsCommands: RtkCommand[];
  rtkRecentActivity: string[];
  rtkDiscoverAvailable: boolean;
  rtkDiscoverError: string | undefined;
  rtkDiscoverSummary: string | undefined;
  rtkCoverageGaps: RtkCoverageGap[];
  rtkUnhandledCommands: RtkUnhandledCommand[];
  topCommands: RtkCommand[];
  recentCommands: string[];
  raw: string;
  error: string | undefined;
}

export interface DashboardResponseSummary extends Summary {
  skippedZeroTokenSessions: number;
}

export interface DashboardResponse extends Omit<DashboardSnapshot, "summary"> {
  appVersion: string;
  summary: DashboardResponseSummary;
  pricing: PricingResponse;
  rtkGain: RtkGain;
}
