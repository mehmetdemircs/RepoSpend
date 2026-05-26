export type SourceClient = "codex" | "claude" | "cursor" | "copilot" | "opencode" | "gemini-cli" | "unknown";
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
  serviceTier?: string | undefined;
  serviceTierSource?: "session_usage" | "current_config" | undefined;
  serviceTierConfidence?: "high" | "medium" | "low" | undefined;
  serviceTierDetail?: string | undefined;
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

export interface RepoAlias {
  name: string;
  paths: string[];
}

export interface RepoSpendConfig {
  repos?: RepoAlias[];
  pricingPath?: string;
  experimentalSources?: {
    cursor?: boolean;
  };
}

export interface SourceStatus {
  id: SourceClient;
  label: string;
  available: boolean;
  paths: string[];
  warnings: string[];
  serviceTier?: string | undefined;
  serviceTierSource?: "session_usage" | "current_config" | undefined;
  serviceTierConfidence?: "high" | "medium" | "low" | undefined;
  serviceTierDetail?: string | undefined;
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

export type DataConfidenceTone = "good" | "attention" | "critical";

export interface DataConfidenceIssue {
  id: string;
  title: string;
  detail: string;
  tone: DataConfidenceTone;
  sourceId?: SourceClient;
  affectedSessionIds: string[];
}

export interface DataConfidenceReport {
  score: number;
  label: "High" | "Medium" | "Low";
  sessionCount: number;
  sourceCount: number;
  tokenDataSessions: number;
  missingTokenSessions: number;
  pricedTokenSessions: number;
  unpricedTokenSessions: number;
  highConfidenceTokenSessions: number;
  verifiedRepoSessions: number;
  unknownRepoSessions: number;
  unknownSurfaceSessions: number;
  parseIssueCount: number;
  sourceWarningCount: number;
  tokenDataPct: number;
  pricingCoveragePct: number;
  highConfidenceTokenPct: number;
  verifiedRepoPct: number;
  issues: DataConfidenceIssue[];
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
  copilotHome?: string;
  otelPath?: string;
  globalStoragePath?: string;
  workspaceStoragePath?: string;
  stateExists?: boolean;
  sessionsExists?: boolean;
  otelExists?: boolean;
  projectsExists?: boolean;
  historyExists?: boolean;
  otelFileCount?: number;
  debugLogFileCount?: number;
  transcriptFileCount?: number;
  sessionStateFileCount?: number;
  databaseFileCount?: number;
  skippedFileCount?: number;
  sessionFileCount: number;
  sessionsImported?: number;
  parseFailureCount?: number;
  unreadableFileCount?: number;
  malformedFileCount?: number;
  projectDirCount?: number;
  historyEntryCount?: number;
  serviceTier?: string | undefined;
  serviceTierSource?: "session_usage" | "current_config" | undefined;
  serviceTierConfidence?: "high" | "medium" | "low" | undefined;
  serviceTierDetail?: string | undefined;
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
  confidence: DataConfidenceReport;
}

export interface ModelPricing {
  inputPerMillion: number;
  cachedInputPerMillion?: number;
  cacheCreationInputPerMillion?: number;
  outputPerMillion: number;
  reasoningOutputPerMillion?: number;
  note?: string;
}

export function normalizePricingModelId(model: string): string {
  return model
    .toLowerCase()
    .replace(/^github_copilot\//, "")
    .replace(/^github-copilot\//, "")
    .replace(/^copilot\//, "")
    .replace(/claude-(opus|sonnet|haiku)-(\d+)\.(\d+)(?=$|[-.])/, "claude-$1-$2-$3");
}

export function claudePricingFamilyModel(model: string, isUsable: (model: string) => boolean = () => true): string | undefined {
  const families = [
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-opus-4-5",
    "claude-opus-4-1",
    "claude-opus-4",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-sonnet-4",
    "claude-haiku-4-5",
    "claude-3-5-haiku",
  ];
  const normalized = normalizePricingModelId(model);
  if (normalized === "claude-opus-4-6-fast-mode") return undefined;
  return families.find((candidate) => (normalized === candidate || normalized.startsWith(`${candidate}-`) || normalized.startsWith(`${candidate}.`)) && isUsable(candidate));
}

export function copilotPricingFamilyModel(model: string, isUsable: (model: string) => boolean = () => true): string | undefined {
  const normalized = normalizePricingModelId(model);
  const claudeFamily = claudePricingFamilyModel(normalized, isUsable);
  if (claudeFamily) return claudeFamily;
  if ((normalized === "gpt-4.1" || normalized.startsWith("gpt-4.1-") || normalized.startsWith("gpt-41")) && isUsable("gpt-4.1")) return "gpt-4.1";
  if ((normalized === "gemini-2.5-pro" || normalized.startsWith("gemini-2.5-pro-")) && isUsable("gemini-2.5-pro")) return "gemini-2.5-pro";
  if ((normalized === "gemini-3-flash" || normalized.startsWith("gemini-3-flash-")) && isUsable("gemini-3-flash")) return "gemini-3-flash";
  if ((normalized === "gemini-3.1-pro" || normalized.startsWith("gemini-3.1-pro-")) && isUsable("gemini-3.1-pro")) return "gemini-3.1-pro";
  if ((normalized === "gemini-3.5-flash" || normalized.startsWith("gemini-3.5-flash-")) && isUsable("gemini-3.5-flash")) return "gemini-3.5-flash";
  if ((normalized === "raptor-mini" || normalized.startsWith("raptor-mini-") || normalized.startsWith("oswe-vscode")) && isUsable("raptor-mini")) return "raptor-mini";
  if ((normalized === "lark" || normalized.startsWith("lark-")) && isUsable("lark")) return "lark";
  if ((normalized === "goldeneye" || normalized.startsWith("goldeneye-")) && isUsable("goldeneye")) return "goldeneye";
  return undefined;
}

interface ParsedVersionedModel {
  tier: string;
  version: number;
}

// Splits a model id into a pricing "tier" (family + size/variant suffix) and a comparable
// version number, so an unknown newer release can inherit the nearest known older version's
// rates. Claude versions are dash-separated after normalization (claude-opus-4-8); OpenAI GPT
// versions are dot-separated with an optional variant suffix (gpt-5.5, gpt-5-mini, gpt-5.1-codex-max).
function parseVersionedModel(normalized: string): ParsedVersionedModel | undefined {
  // Fast mode and other special rate cards are intentionally not version-inherited.
  if (normalized.includes("fast-mode")) return undefined;
  const claude = normalized.match(/^(claude-(?:opus|sonnet|haiku))-(\d+)(?:-(\d+))?/);
  if (claude) {
    const minor = claude[3] ? Number(claude[3]) : 0;
    return { tier: claude[1]!, version: Number(claude[2]) + minor / 100 };
  }
  // Single-digit major keeps dot-less aliases like "gpt-41" (meaning gpt-4.1) from parsing as
  // version 41; those fall through to the existing alias handling instead.
  const gpt = normalized.match(/^(gpt)-(\d)(?:\.(\d+))?(-[a-z][a-z0-9-]*)?$/);
  if (gpt) {
    const minor = gpt[3] ? Number(gpt[3]) : 0;
    return { tier: `gpt${gpt[4] ?? ""}`, version: Number(gpt[2]) + minor / 100 };
  }
  return undefined;
}

// Resolves an unknown model to the highest known model in the same tier whose version is
// less than or equal to the requested one (e.g. opus 4.9 -> opus 4.8, gpt 5.6 -> gpt 5.5).
// Returns undefined when no same-or-older sibling exists so the model stays explicitly unpriced.
export function versionedFallbackModel(model: string, knownModels: string[], isUsable: (model: string) => boolean = () => true): string | undefined {
  const target = parseVersionedModel(normalizePricingModelId(model));
  if (!target) return undefined;
  let best: { id: string; version: number } | undefined;
  for (const candidate of knownModels) {
    const parsed = parseVersionedModel(normalizePricingModelId(candidate));
    if (!parsed || parsed.tier !== target.tier || parsed.version > target.version) continue;
    if (!isUsable(candidate)) continue;
    if (!best || parsed.version > best.version) best = { id: candidate, version: parsed.version };
  }
  return best?.id;
}

export function isCopilotAliasModel(model: string): boolean {
  const normalized = normalizePricingModelId(model);
  return normalized.startsWith("raptor-mini") || normalized.startsWith("oswe-vscode") || normalized === "lark" || normalized.startsWith("lark-") || normalized.startsWith("goldeneye");
}

export function positiveRate(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isUsableModelPricing(pricing: ModelPricing | undefined): pricing is ModelPricing {
  return positiveRate(pricing?.inputPerMillion) && positiveRate(pricing?.outputPerMillion);
}

export function findModelPricing(model: string, pricing: Record<string, ModelPricing>): ModelPricing | undefined {
  const lower = normalizePricingModelId(model);
  const exact = pricing[model] ?? pricing[lower];
  if (isUsableModelPricing(exact)) return exact;
  const versioned = versionedFallbackModel(lower, Object.keys(pricing), (candidate) => isUsableModelPricing(pricing[candidate]));
  if (versioned) return pricing[versioned];
  const claudeFamily = claudePricingFamilyModel(lower, (candidate) => isUsableModelPricing(pricing[candidate]));
  if (claudeFamily) return pricing[claudeFamily];
  const copilotFamily = copilotPricingFamilyModel(lower, (candidate) => isUsableModelPricing(pricing[candidate]));
  if (copilotFamily) return pricing[copilotFamily];
  return undefined;
}

export interface PricingResolution {
  pricing: ModelPricing;
  sourceModel: string | undefined;
  inherited: boolean;
}

export function resolvePricingForModel(model: string, table: Record<string, ModelPricing>): PricingResolution {
  const lower = normalizePricingModelId(model);
  const exactModel = table[model] ? model : table[lower] ? lower : undefined;
  const exactPricing = exactModel ? table[exactModel] : undefined;
  if (isUsableModelPricing(exactPricing)) {
    return { pricing: exactPricing, sourceModel: exactModel, inherited: false };
  }
  const versioned = versionedFallbackModel(lower, Object.keys(table), (candidate) => isUsableModelPricing(table[candidate]));
  if (versioned) {
    return { pricing: table[versioned]!, sourceModel: versioned, inherited: versioned !== model && versioned !== lower };
  }
  const claudeFamily = claudePricingFamilyModel(lower, (candidate) => isUsableModelPricing(table[candidate]));
  if (claudeFamily) {
    return { pricing: table[claudeFamily]!, sourceModel: claudeFamily, inherited: claudeFamily !== model && claudeFamily !== lower };
  }
  const copilotFamily = copilotPricingFamilyModel(lower, (candidate) => isUsableModelPricing(table[candidate]));
  if (copilotFamily) {
    return { pricing: table[copilotFamily]!, sourceModel: copilotFamily, inherited: copilotFamily !== model && copilotFamily !== lower };
  }
  return {
    pricing: exactPricing ?? {
      inputPerMillion: 0,
      cacheCreationInputPerMillion: 0,
      cachedInputPerMillion: 0,
      outputPerMillion: 0,
      reasoningOutputPerMillion: 0,
    },
    sourceModel: exactModel,
    inherited: false,
  };
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
  config: RepoSpendConfig;
  configPath?: string;
  rtkGain: RtkGain;
}
