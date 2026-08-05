import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildDashboardSnapshot, clearRepoSpendCache, configPath, loadConfig, loadConfigWithWarnings, loadPricingTable, lowerBound, pricingOverrides, repospendHome, resolvePricingPath, saveConfig, savePricingTable, scanUsageSources, toCsv, upperBound, type PricingTable } from "@repospend/core";
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
let scanCache: { key: string; expiresAt: number; data: RawUsageData } | undefined;
let warmScanInFlight = false;
let warmScanChild: ChildProcess | undefined;
const warmedScanKeys = new Set<string>();

export function readDashboardData(filters: UsageFilters = {}, options: DashboardReadOptions = {}): DashboardData {
  const raw = readRawUsageData(filters);
  return buildDashboardSnapshot({ ...raw, sessions: displaySessions(raw.sessions, options), filters });
}

export function clearScanCache(): void {
  scanCache = undefined;
  warmScanInFlight = false;
  warmScanChild?.kill();
  warmScanChild = undefined;
  warmedScanKeys.clear();
}

function readRawUsageData(filters: UsageFilters = {}): RawUsageData {
  const cwd = runtimeCwd();
  const { config, warnings: configWarnings } = loadConfigWithWarnings();
  const cacheKey = scanCacheKey({ cwd, filters, cursorEnabled: config.experimentalSources?.cursor === true });
  if (scanCache && scanCache.key === cacheKey && scanCache.expiresAt > Date.now()) {
    return scanCache.data;
  }

  const pricing = loadPricingTable(resolvePricingPath(config));
  const scanWindow = scanWindowFromFilters(filters);
  const scan = scanUsageSources({
    config,
    pricing,
    ...(scanWindow ? { scanWindow } : {}),
  });
  const data = {
    sources: scan.sources.map((source) => ({ ...source, warnings: [...source.warnings, ...configWarnings] })),
    sourceStats: scan.sourceStats,
    sessions: scan.sessions,
  };
  scanCache = { key: cacheKey, data, expiresAt: Date.now() + scanCacheTtlMs };
  return data;
}

export function warmDashboardCache(filters: UsageFilters = {}, options: DashboardReadOptions = {}): { started: boolean; key: string; reason?: string } {
  const cwd = runtimeCwd();
  const config = loadConfig();
  const key = scanCacheKey({ cwd, filters, cursorEnabled: config.experimentalSources?.cursor === true });
  if (scanCache?.key === key || warmedScanKeys.has(key)) return { started: false, key, reason: "already_warm" };
  if (warmScanInFlight) return { started: false, key, reason: "warm_scan_in_flight" };

  warmScanInFlight = true;
  let child: ChildProcess;
  try {
    child = spawn(process.execPath, [...process.execArgv, cliEntryPath(), "__warm-cache", ...warmCacheArgs(filters, options)], {
      detached: true,
      env: process.env,
      stdio: "ignore",
    });
  } catch (error) {
    warmScanInFlight = false;
    return { started: false, key, reason: error instanceof Error ? error.message : String(error) };
  }
  warmScanChild = child;
  child.once("error", () => {
    warmScanInFlight = false;
    if (warmScanChild === child) warmScanChild = undefined;
  });
  child.once("exit", (code) => {
    warmScanInFlight = false;
    if (warmScanChild === child) warmScanChild = undefined;
    if (code === 0) warmedScanKeys.add(key);
  });
  child.unref();

  return { started: true, key };
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

export function readConfigData(): { path: string; config: ReturnType<typeof loadConfig> } {
  return {
    path: configPath(),
    config: loadConfig(),
  };
}

export function writeConfigData(nextConfig: ReturnType<typeof loadConfig>): { path: string; config: ReturnType<typeof loadConfig> } {
  const saved = saveConfig(nextConfig);
  clearScanCache();
  return {
    path: configPath(),
    config: saved,
  };
}

export function writePricingData(models: PricingTable): { path: string; models: PricingTable } {
  const config = loadConfig();
  const pricingPath = resolvePricingPath(config);
  savePricingTable(pricingPath, pricingOverrides(models));
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

export function clearRepoSpendParseCache(): { path: string; removed: boolean } {
  const result = clearRepoSpendCache();
  clearScanCache();
  return result;
}

export function exportJson(filters: UsageFilters = {}, options: DashboardReadOptions = {}): string {
  return JSON.stringify(readDashboardData(filters, options).sessions, null, 2);
}

export function exportCsv(filters: UsageFilters = {}, options: DashboardReadOptions = {}): string {
  return toCsv(readDashboardData(filters, options).sessions);
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
  if (session.sourceClient === "copilot" && app === "Copilot CLI") return "GitHub Copilot CLI";
  if (!shouldScopeApp(app)) return app;
  return `${sourceClientLabel(session.sourceClient)} on ${app}`;
}

function scanWindowFromFilters(filters: UsageFilters) {
  const fromMs = filters.from ? lowerBound(filters.from) : undefined;
  const toMs = filters.to ? upperBound(filters.to) : undefined;
  const scanWindow: { fromMs?: number; toMs?: number } = {};
  if (fromMs !== undefined) scanWindow.fromMs = fromMs;
  if (toMs !== undefined) scanWindow.toMs = toMs;
  return scanWindow.fromMs === undefined && scanWindow.toMs === undefined ? undefined : scanWindow;
}

function scanCacheKey({ cwd, filters, cursorEnabled }: { cwd: string; filters: UsageFilters; cursorEnabled: boolean }): string {
  return JSON.stringify({
    cwd,
    from: filters.from ?? "",
    to: filters.to ?? "",
    cursor: cursorEnabled,
  });
}

function warmCacheArgs(filters: UsageFilters, options: DashboardReadOptions): string[] {
  const args: string[] = [];
  if (filters.from) args.push("--from", filters.from);
  if (filters.to) args.push("--to", filters.to);
  if (options.splitSourceApps) args.push("--splitSourceApps");
  return args;
}

function cliEntryPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const sourceCli = path.join(currentDir, "cli.ts");
  if (fs.existsSync(sourceCli)) return sourceCli;
  return path.join(currentDir, "cli.js");
}

function shouldScopeApp(app: string): boolean {
  const normalized = app.toLowerCase();
  return normalized.includes("vs code") || normalized.includes("vscode") || normalized.includes("terminal") || normalized.includes("cli");
}

function sourceClientLabel(source: NormalizedUsage["sourceClient"]): string {
  if (source === "codex") return "Codex";
  if (source === "claude") return "Claude Code";
  if (source === "copilot") return "GitHub Copilot";
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
