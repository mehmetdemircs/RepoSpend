import fs from "node:fs";
import { buildDashboardSnapshot, loadConfig, loadConfigWithWarnings, loadPricingTable, repospendHome, resolvePricingPath, savePricingTable, scanCodex, toCsv, type PricingTable } from "@repospend/core";
import type { DashboardSnapshot, NormalizedUsage, UsageFilters } from "@repospend/types";

export type DashboardData = DashboardSnapshot;

interface RawUsageData {
  sources: ReturnType<typeof scanCodex>["source"][];
  sourceStats: ReturnType<typeof scanCodex>["stats"][];
  sessions: NormalizedUsage[];
}

const scanCacheTtlMs = 10_000;
let scanCache: { cwd: string; expiresAt: number; data: RawUsageData } | undefined;

export function readDashboardData(filters: UsageFilters = {}): DashboardData {
  const raw = readRawUsageData();
  return buildDashboardSnapshot({ ...raw, filters });
}

export function clearScanCache(): void {
  scanCache = undefined;
}

function readRawUsageData(): RawUsageData {
  const cwd = runtimeCwd();
  if (scanCache && scanCache.cwd === cwd && scanCache.expiresAt > Date.now()) {
    return scanCache.data;
  }

  const { config, warnings: configWarnings } = loadConfigWithWarnings();
  const pricing = loadPricingTable(resolvePricingPath(config));
  const codex = scanCodex({ config, pricing });
  const data = {
    sources: [{ ...codex.source, warnings: [...codex.source.warnings, ...configWarnings] }],
    sourceStats: [codex.stats],
    sessions: codex.sessions,
  };
  scanCache = { cwd, data, expiresAt: Date.now() + scanCacheTtlMs };
  return data;
}

export function parseFilters(query: Record<string, unknown>): UsageFilters {
  const filters: UsageFilters = {};
  const source = listQuery(query.source);
  const sourceApp = listQuery(query.sourceApp);
  const repo = listQuery(query.repo);
  const model = listQuery(query.model);
  const from = stringQuery(query.from);
  const to = stringQuery(query.to);
  if (source) filters.source = source;
  if (sourceApp) filters.sourceApp = sourceApp;
  if (repo) filters.repo = repo;
  if (model) filters.model = model;
  if (from) filters.from = from;
  if (to) filters.to = to;
  return filters;
}

export function readPricingData(): { path: string; models: PricingTable } {
  const config = loadConfig();
  const pricingPath = resolvePricingPath(config);
  return {
    path: pricingPath,
    models: loadPricingTable(pricingPath),
  };
}

export function writePricingData(models: PricingTable): { path: string; models: PricingTable } {
  const config = loadConfig();
  const pricingPath = resolvePricingPath(config);
  savePricingTable(pricingPath, models);
  clearScanCache();
  return {
    path: pricingPath,
    models: loadPricingTable(pricingPath),
  };
}

export function clearRepoSpendLocalData(): { path: string; removed: boolean } {
  const target = repospendHome();
  const removed = fs.existsSync(target);
  fs.rmSync(target, { recursive: true, force: true });
  clearScanCache();
  return { path: target, removed };
}

export function exportJson(): string {
  return JSON.stringify(readDashboardData().sessions, null, 2);
}

export function exportCsv(): string {
  return toCsv(readDashboardData().sessions);
}

function stringQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function listQuery(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const parsed = values.flatMap((item) => typeof item === "string" ? item.split(",") : []).map((item) => item.trim()).filter(Boolean);
  return parsed.length ? parsed : undefined;
}

function runtimeCwd(): string {
  return process.env.INIT_CWD || process.cwd();
}
