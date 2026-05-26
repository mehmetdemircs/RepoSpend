import type { NormalizedUsage, RepoSpendConfig, SourceStatus } from "@repospend/types";
import type { PricingTable } from "../pricing.js";

export interface SourceScanWindow {
  fromMs?: number;
  toMs?: number;
}

export interface BaseScanOptions {
  config?: RepoSpendConfig;
  scanWindow?: SourceScanWindow;
  pricing: PricingTable;
}

export interface BaseScanStats {
  sourceId: string;
}

export interface BaseScanResult<TStats extends BaseScanStats = BaseScanStats> {
  source: SourceStatus;
  sessions: NormalizedUsage[];
  stats: TStats;
}

export interface SourceAdapter<TOptions extends BaseScanOptions, TStats extends BaseScanStats> {
  readonly id: TStats["sourceId"];
  scan(options: TOptions): BaseScanResult<TStats>;
}
