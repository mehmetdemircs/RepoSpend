import type { RtkGain } from "@repospend/types";

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
