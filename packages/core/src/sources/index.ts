import type { NormalizedUsage, RepoSpendConfig, SourceStatus } from "@repospend/types";
import type { PricingTable } from "../pricing.js";
import { scanClaude, type ClaudeScanStats } from "./claude.js";
import { scanCodex, type CodexScanStats } from "./codex.js";

export interface UsageSourceScanOptions {
  config?: RepoSpendConfig;
  pricing: PricingTable;
  codexHome?: string;
  claudeHome?: string;
}

export interface UsageSourceScanResult {
  sources: SourceStatus[];
  sourceStats: Array<CodexScanStats | ClaudeScanStats>;
  sessions: NormalizedUsage[];
}

export function scanUsageSources(options: UsageSourceScanOptions): UsageSourceScanResult {
  const codex = scanCodex({
    ...(options.codexHome ? { codexHome: options.codexHome } : {}),
    ...(options.config ? { config: options.config } : {}),
    pricing: options.pricing,
  });
  const claude = scanClaude({
    ...(options.claudeHome ? { claudeHome: options.claudeHome } : {}),
    ...(options.config ? { config: options.config } : {}),
    pricing: options.pricing,
  });
  return {
    sources: [codex.source, claude.source],
    sourceStats: [codex.stats, claude.stats],
    sessions: [...codex.sessions, ...claude.sessions],
  };
}
