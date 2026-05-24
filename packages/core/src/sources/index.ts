import type { NormalizedUsage, RepoSpendConfig, SourceStatus } from "@repospend/types";
import type { PricingTable } from "../pricing.js";
import { scanClaude, type ClaudeScanStats } from "./claude.js";
import { scanCodex, type CodexScanStats } from "./codex.js";
import { scanCursor, type CursorScanStats } from "./cursor.js";

export interface UsageSourceScanOptions {
  config?: RepoSpendConfig;
  pricing: PricingTable;
  codexHome?: string;
  claudeHome?: string;
  cursorHome?: string;
  scanWindow?: SourceScanWindow;
}

export interface SourceScanWindow {
  fromMs?: number;
  toMs?: number;
}

export interface UsageSourceScanResult {
  sources: SourceStatus[];
  sourceStats: Array<CodexScanStats | ClaudeScanStats | CursorScanStats>;
  sessions: NormalizedUsage[];
}

export function scanUsageSources(options: UsageSourceScanOptions): UsageSourceScanResult {
  const codex = scanCodex({
    ...(options.codexHome ? { codexHome: options.codexHome } : {}),
    ...(options.config ? { config: options.config } : {}),
    ...(options.scanWindow ? { scanWindow: options.scanWindow } : {}),
    pricing: options.pricing,
  });
  const claude = scanClaude({
    ...(options.claudeHome ? { claudeHome: options.claudeHome } : {}),
    ...(options.config ? { config: options.config } : {}),
    ...(options.scanWindow ? { scanWindow: options.scanWindow } : {}),
    pricing: options.pricing,
  });
  const cursorEnabled = options.config?.experimentalSources?.cursor === true || Boolean(options.cursorHome);
  const cursor = cursorEnabled
    ? scanCursor({
        ...(options.cursorHome ? { cursorHome: options.cursorHome } : {}),
        ...(options.config ? { config: options.config } : {}),
        ...(options.scanWindow ? { scanWindow: options.scanWindow } : {}),
        pricing: options.pricing,
      })
    : undefined;
  return {
    sources: [codex.source, claude.source, ...(cursor ? [cursor.source] : [])],
    sourceStats: [codex.stats, claude.stats, ...(cursor ? [cursor.stats] : [])],
    sessions: [...codex.sessions, ...claude.sessions, ...(cursor?.sessions ?? [])],
  };
}
