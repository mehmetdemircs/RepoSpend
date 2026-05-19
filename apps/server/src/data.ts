import fs from "node:fs";
import { buildDashboardSnapshot, loadConfig, loadConfigWithWarnings, loadPricingTable, repospendHome, resolvePricingPath, savePricingTable, scanUsageSources, toCsv, type PricingTable } from "@repospend/core";
import type { DashboardSnapshot, NormalizedUsage, UsageFilters } from "@repospend/types";

export type DashboardData = DashboardSnapshot;

export interface DashboardReadOptions {
  splitSourceApps?: boolean;
}

interface RawUsageData {
  sources: ReturnType<typeof scanUsageSources>["sources"];
  sourceStats: ReturnType<typeof scanUsageSources>["sourceStats"];
  sessions: NormalizedUsage[];
}

const scanCacheTtlMs = 10_000;
let scanCache: { cwd: string; expiresAt: number; data: RawUsageData } | undefined;

export function readDashboardData(filters: UsageFilters = {}, options: DashboardReadOptions = {}): DashboardData {
  const raw = readRawUsageData();
  return buildDashboardSnapshot({ ...raw, sessions: displaySessions(raw.sessions, options), filters });
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
  const scan = scanUsageSources({ config, pricing });
  const data = {
    sources: scan.sources.map((source) => ({ ...source, warnings: [...source.warnings, ...configWarnings] })),
    sourceStats: scan.sourceStats,
    sessions: scan.sessions,
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

export function parseDashboardOptions(query: Record<string, unknown>): DashboardReadOptions {
  return {
    splitSourceApps: query.splitSourceApps === "true" || query.splitSourceApps === "1",
  };
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

export function displaySessions(sessions: NormalizedUsage[], options: DashboardReadOptions): NormalizedUsage[] {
  if (!options.splitSourceApps) return sessions;
  return sessions.map((session) => {
    const sourceApp = sourceScopedAppLabel(session);
    return sourceApp === session.sourceApp ? session : { ...session, sourceApp };
  });
}

function sourceScopedAppLabel(session: NormalizedUsage): string {
  const app = session.sourceApp || fallbackSurfaceLabel(session.detectedSurface);
  if (!app || app === "Unknown") return sourceClientLabel(session.sourceClient);
  if (!shouldScopeApp(app)) return app;
  return `${sourceClientLabel(session.sourceClient)} on ${app}`;
}

function shouldScopeApp(app: string): boolean {
  const normalized = app.toLowerCase();
  return normalized.includes("vs code") || normalized.includes("vscode") || normalized.includes("terminal") || normalized.includes("cli");
}

function sourceClientLabel(source: NormalizedUsage["sourceClient"]): string {
  if (source === "codex") return "Codex";
  if (source === "claude") return "Claude Code";
  if (source === "gemini-cli") return "Gemini CLI";
  if (source === "opencode") return "OpenCode";
  if (source === "cursor") return "Cursor";
  return "Unknown";
}

function fallbackSurfaceLabel(surface: NormalizedUsage["detectedSurface"]): string {
  if (surface === "terminal_cli") return "Terminal";
  if (surface === "vscode_extension") return "VS Code";
  if (surface === "local_agent") return "Desktop local agent";
  if (surface === "codex_exec") return "Codex";
  if (surface === "codex_app_cloud") return "Codex app";
  return "Unknown";
}

function runtimeCwd(): string {
  return process.env.INIT_CWD || process.cwd();
}
