import type { ReactNode } from "react";
import type {
  DashboardResponse,
  HealthSignal,
  KeyInsight,
  ModelPricing,
  NormalizedUsage,
  PricingResponse,
  RepoUsageRollup,
  RtkCommand,
  RtkCoverageGap,
  RtkGain,
  RtkUnhandledCommand,
  SourceStatus,
  Summary,
  UsageGroup as SnapshotUsageGroup,
} from "@repospend/types";

export type {
  DashboardResponse,
  HealthSignal,
  KeyInsight,
  ModelPricing,
  PricingResponse,
  RepoUsageRollup,
  RtkCommand,
  RtkCoverageGap,
  RtkGain,
  RtkUnhandledCommand,
  SourceStatus,
  Summary,
};

export type Session = NormalizedUsage;
export type Source = SourceStatus;
export type UsageGroup = SnapshotUsageGroup & {
  reasoningOutputTokens?: number;
  sessions?: Session[];
  fileEditCount?: RepoUsageRollup["fileEditCount"];
  failedCommandCount?: RepoUsageRollup["failedCommandCount"];
  tokenRoiTokensPerEdit?: RepoUsageRollup["tokenRoiTokensPerEdit"];
  tokenRoiLabel?: RepoUsageRollup["tokenRoiLabel"];
  tokenRoiTitle?: RepoUsageRollup["tokenRoiTitle"];
};
export type ApiData = Omit<DashboardResponse, "repos" | "days" | "hours" | "models" | "sourceApps"> & {
  repos: UsageGroup[];
  days: UsageGroup[];
  hours: UsageGroup[];
  sessions: Session[];
  models: UsageGroup[];
  sourceApps: UsageGroup[];
};

export type Filters = { source: string[]; sourceApp: string[]; repo: string[]; model: string[]; from: string; to: string };
export type RangePreset = "lastHour" | "last6" | "last12" | "last24" | "last7" | "last14" | "last30" | "thisWeek" | "thisMonth" | "all" | "custom";
export type FilterSortMode = "usage" | "name";
export type DisplaySettings = { chartGroupLimit: number; tablePageSize: number; splitSourceApps: boolean };
export type RtkCommandSortKey = "command" | "count" | "saved" | "reduction" | "runtime";
export type MetricKey = "estimatedCostUsd" | "totalTokens" | "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens";
export type SortDirection = "asc" | "desc";
export type RepoSortKey = "repo" | "cost" | "tokens" | "input" | "cached" | "output" | "reasoning" | "sessions" | "cache" | "files" | "failed" | "roi" | "warnings";
export type SessionSortKey = "repo" | "app" | "session" | "model" | "started" | "cost" | "tokens" | "input" | "cached" | "output" | "reasoning" | "messages" | "prompts" | "commands" | "duration" | "files" | "failed" | "warnings";
export type SessionColumnKey = "input" | "cached" | "output" | "reasoning" | "messages" | "prompts" | "commands" | "commandIssues" | "edits" | "parse" | "tokenMethod" | "confidence" | "checkpoints";
export type ViewKey = "dashboard" | "sessions" | "sessionDetail" | "repos" | "repoDetail" | "commands" | "insights" | "rtk" | "settings";
export type SessionDetailTab = "overview" | "timeline" | "files" | "tokens" | "metadata";
export type TimelineRoleFilter = "all" | "user" | "assistant";
export type SettingsTab = "pricing" | "sources" | "tokens" | "privacy" | "advanced";
export type RepoDetailTab = "overview" | "sessions" | "cost" | "files" | "commands" | "metadata";
export type PricingProviderFilter = "all" | "openai" | "claude" | "custom";
export type PricingViewFilter = "used" | "missing" | "all";
export type QuickSessionFilter = "highToken" | "failedCommands" | "noEdits" | "completed" | "partial" | "vscode" | "terminal" | "unknownSurface";
export type RepoSessionQuickFilter = "expensive" | "partial" | "longRunning" | "commandIssues" | "opusOnly";
export type InsightItem = HealthSignal;
export type PickerIcon = "source" | "app" | "repo" | "model";
export type PickerOption = { value: string; label: string; icon?: PickerIcon; usage?: number; verified?: boolean };
export type BreakdownTab = "providers" | "apps";
export type BreakdownRow = { id: string; label: string; sessionCount: number; totalTokens: number; estimatedCostUsd: number | undefined; missingTokenSessions: number; iconLabel?: string; source?: Session["sourceClient"] };
export type MetricBreakdownRow = { label: string; value: ReactNode; detail?: string };
export type PopoverPosition = { top: number; left: number };
export type TokenStats = {
  methodLabel: string;
  confidenceLabel: string;
  tokenSnapshots: number;
  sessionsWithTokenData: number;
  sessionsMissingTokenData: number;
  methodCounts: Record<string, number>;
  confidenceCounts: Record<string, number>;
};
export type RepoRow = UsageGroup & {
  fileEditCount: number;
  failedCommandCount: number;
  tokenRoiLabel: string;
  tokenRoiTitle: string;
};
export type RepoCostConcentration = {
  topSessionCost: number | undefined;
  topSessionShare: number;
  topThreeCost: number | undefined;
  topThreeShare: number;
  topSessions: Session[];
  extreme: boolean;
};
export type RepoReviewSession = { session: Session; reason: string };
export type RepoModelSpend = { id: string; label: string; sessionCount: number; totalTokens: number; estimatedCostUsd: number | undefined; costShare: number };
export type RepoCommandTotals = { important: number; harmless: number; repeated: number };
export type PricingRow = { model: string; pricing: ModelPricing; sourceModel: string | undefined; inherited: boolean };
export type AgentFrictionRepo = {
  repoRoot: string;
  repoName: string;
  importantFailures: number;
  harmlessNonZeroEvents: number;
  repeatedFailureClusters: number;
  sessionsNeedingReview: number;
  topFailureType: string | undefined;
  impact: Session["commandIssueImpact"];
  totalTokens: number;
  estimatedCostUsd: number | undefined;
};

export const metricOptions: Array<{ value: MetricKey; label: string }> = [
  { value: "estimatedCostUsd", label: "API-equivalent cost" },
  { value: "totalTokens", label: "Total tokens" },
  { value: "inputTokens", label: "Total input tokens" },
  { value: "cachedInputTokens", label: "Cached input tokens" },
  { value: "outputTokens", label: "Output tokens" },
  { value: "reasoningTokens", label: "Reasoning tokens" },
];

export const rangeOptions: Array<{ value: RangePreset; label: string }> = [
  { value: "lastHour", label: "Last hour" },
  { value: "last6", label: "Last 6 hours" },
  { value: "last12", label: "Last 12 hours" },
  { value: "last24", label: "Last 24 hours" },
  { value: "last7", label: "Last 7 days" },
  { value: "last14", label: "Last 14 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisWeek", label: "This week" },
  { value: "thisMonth", label: "This month" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom dates" },
];

export const colors = ["#6d5dfc", "#2dd4bf", "#f59e0b", "#ef4444", "#38bdf8", "#a78bfa"];
export const chartLimitOptions = [5, 10, 15, 25];
export const pageSizeOptions = [10, 25, 50, 100, 250];
export const defaultDisplaySettings: DisplaySettings = { chartGroupLimit: 10, tablePageSize: 25, splitSourceApps: true };
export const defaultSessionColumns: SessionColumnKey[] = ["input", "cached", "output", "reasoning", "messages", "prompts", "commands", "commandIssues", "edits"];
export const sessionColumnOptions: Array<{ key: SessionColumnKey; label: string; group: "Usage" | "Activity" | "Technical" }> = [
  { key: "input", label: "Total input tokens", group: "Usage" },
  { key: "cached", label: "Cached input", group: "Usage" },
  { key: "output", label: "Output tokens", group: "Usage" },
  { key: "reasoning", label: "Reasoning tokens", group: "Usage" },
  { key: "messages", label: "Messages", group: "Activity" },
  { key: "prompts", label: "Prompts", group: "Activity" },
  { key: "commands", label: "Commands", group: "Activity" },
  { key: "commandIssues", label: "Command issues", group: "Activity" },
  { key: "edits", label: "Edits", group: "Activity" },
  { key: "parse", label: "Parse status", group: "Technical" },
  { key: "tokenMethod", label: "Token method", group: "Technical" },
  { key: "confidence", label: "Token confidence", group: "Technical" },
  { key: "checkpoints", label: "Token checkpoints", group: "Technical" },
];
