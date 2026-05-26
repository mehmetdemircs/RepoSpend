import type { NormalizedUsage, RepoSpendConfig, SourceStatus } from "@repospend/types";
import type { PricingTable } from "../pricing.js";
import { scanClaude, type ClaudeScanStats } from "./claude.js";
import { scanCodex, type CodexScanStats } from "./codex.js";
import { scanCopilot, type CopilotScanStats } from "./copilot.js";
import { scanCursor, type CursorScanStats } from "./cursor.js";
import type { BaseScanResult, SourceAdapter, SourceScanWindow } from "./types.js";

export type { BaseScanOptions, BaseScanResult, BaseScanStats, SourceAdapter, SourceScanWindow } from "./types.js";

export interface UsageSourceScanOptions {
  config?: RepoSpendConfig;
  pricing: PricingTable;
  codexHome?: string;
  claudeHome?: string;
  cursorHome?: string;
  copilotHome?: string;
  scanWindow?: SourceScanWindow;
}

export interface UsageSourceScanResult {
  sources: SourceStatus[];
  sourceStats: Array<CodexScanStats | ClaudeScanStats | CursorScanStats | CopilotScanStats>;
  sessions: NormalizedUsage[];
}

interface AdapterEntry {
  adapter: SourceAdapter<{ config?: RepoSpendConfig; scanWindow?: SourceScanWindow; pricing: PricingTable } & Record<string, unknown>, { sourceId: string }>;
  homeKey: "codexHome" | "claudeHome" | "copilotHome" | "cursorHome";
  homeOption: string;
  enabled?: (options: UsageSourceScanOptions) => boolean;
}

const codexAdapter: SourceAdapter<Parameters<typeof scanCodex>[0], CodexScanStats> = { id: "codex", scan: scanCodex };
const claudeAdapter: SourceAdapter<Parameters<typeof scanClaude>[0], ClaudeScanStats> = { id: "claude", scan: scanClaude };
const copilotAdapter: SourceAdapter<Parameters<typeof scanCopilot>[0], CopilotScanStats> = { id: "copilot", scan: scanCopilot };
const cursorAdapter: SourceAdapter<Parameters<typeof scanCursor>[0], CursorScanStats> = { id: "cursor", scan: scanCursor };

const adapters: AdapterEntry[] = [
  { adapter: codexAdapter as unknown as AdapterEntry["adapter"], homeKey: "codexHome", homeOption: "codexHome" },
  { adapter: claudeAdapter as unknown as AdapterEntry["adapter"], homeKey: "claudeHome", homeOption: "claudeHome" },
  { adapter: copilotAdapter as unknown as AdapterEntry["adapter"], homeKey: "copilotHome", homeOption: "copilotHome" },
  {
    adapter: cursorAdapter as unknown as AdapterEntry["adapter"],
    homeKey: "cursorHome",
    homeOption: "cursorHome",
    enabled: (options) => options.config?.experimentalSources?.cursor === true || Boolean(options.cursorHome),
  },
];

export function scanUsageSources(options: UsageSourceScanOptions): UsageSourceScanResult {
  const sources: SourceStatus[] = [];
  const sourceStats: UsageSourceScanResult["sourceStats"] = [];
  const sessions: NormalizedUsage[] = [];

  for (const entry of adapters) {
    if (entry.enabled && !entry.enabled(options)) continue;
    const home = options[entry.homeKey];
    const result: BaseScanResult = entry.adapter.scan({
      ...(home ? { [entry.homeOption]: home } : {}),
      ...(options.config ? { config: options.config } : {}),
      ...(options.scanWindow ? { scanWindow: options.scanWindow } : {}),
      pricing: options.pricing,
    });
    sources.push(result.source);
    sourceStats.push(result.stats as UsageSourceScanResult["sourceStats"][number]);
    sessions.push(...result.sessions);
  }

  return { sources, sourceStats, sessions };
}
