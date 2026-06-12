import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { pricingInfo } from "@repospend/core";
import type { DashboardResponse, RepoSpendConfig, UsageFilters } from "@repospend/types";
import { clearRepoSpendLocalData, clearRepoSpendParseCache, exportCsv, exportJson, parseDashboardOptions, parseFilters, readConfigData, readDashboardData, readPricingData, warmDashboardCache, writeConfigData, writePricingData } from "./data.js";
import { demoModeEnabled, readDemoDashboardData, readDemoRtkGain } from "./demo/index.js";
import { readRtkGain } from "./rtk.js";

export interface ServerOptions {
  host?: string;
  port?: number;
  portFallbackCount?: number;
  serveWeb?: boolean;
}

export function createServer(options: ServerOptions = {}) {
  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (request, reply) => {
    if (!isProtectedLocalMutation(request.method, request.url)) return;
    if (!isAllowedLocalHost(request.headers.host)) {
      return reply.code(403).send({ error: "Mutating RepoSpend local settings requires a localhost Host header." });
    }
    if (!isAllowedLocalOrigin(request.headers.origin)) {
      return reply.code(403).send({ error: "Mutating RepoSpend local settings requires a localhost Origin." });
    }
  });

  app.get("/api/health", async () => ({ ok: true, app: "RepoSpend", version: readPackageVersion() }));

  app.get("/api/dashboard", async (request): Promise<DashboardResponse> => {
    const query = request.query as Record<string, unknown>;
    const filters = parseFilters(query);
    const dashboardOptions = parseDashboardOptions(query);
    const demoMode = demoModeEnabled();
    const data = demoMode ? readDemoDashboardData(filters, dashboardOptions) : readDashboardData(filters, dashboardOptions);
    const rtkGain = demoMode ? readDemoRtkGain() : await readRtkGain();
    const configData = readConfigData();
    return {
      ...data,
      appVersion: readPackageVersion(),
      summary: { ...data.summary, skippedZeroTokenSessions: data.skippedZeroTokenSessions },
      pricing: {
        info: pricingInfo,
        ...readPricingData(),
      },
      config: configData.config,
      configPath: configData.path,
      rtkGain,
    };
  });

  app.put("/api/settings/pricing", async (request) => ({
    info: pricingInfo,
    ...writePricingData(validatePricingBody(request.body)),
  }));

  app.put("/api/settings/config", async (request) => writeConfigData(validateConfigBody(request.body)));

  app.delete("/api/settings/local-data", async () => clearRepoSpendLocalData());

  app.delete("/api/settings/cache", async () => {
    if (demoModeEnabled()) return { path: "demo mode (cache disabled)", removed: false, demo: true };
    return clearRepoSpendParseCache();
  });

  app.post("/api/cache/warm", async (request) => {
    if (demoModeEnabled()) return { started: false, reason: "demo_mode" };
    const query = request.query as Record<string, unknown>;
    return warmDashboardCache(warmCacheFilters(), parseDashboardOptions(query));
  });

  app.get("/api/export.json", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    reply.header("content-type", "application/json; charset=utf-8");
    return exportJson(parseFilters(query), parseDashboardOptions(query));
  });

  app.get("/api/export.csv", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", "attachment; filename=\"repospend-export.csv\"");
    return exportCsv(parseFilters(query), parseDashboardOptions(query));
  });

  if (options.serveWeb !== false) {
    const serverDist = path.dirname(fileURLToPath(import.meta.url));
    const packagedWebDist = path.resolve(serverDist, "../web-dist");
    const workspaceWebDist = path.resolve(serverDist, "../../web/dist");
    const webDist = fsExists(packagedWebDist) ? packagedWebDist : workspaceWebDist;
    if (!fsExists(webDist)) {
      throw new Error(`RepoSpend web assets are missing. Expected ${packagedWebDist} in the published package, or ${workspaceWebDist} during local development. Run "pnpm pack:prepare" before packaging.`);
    }
    app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.code(404).send({ error: "API route not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}

function fsExists(inputPath: string): boolean {
  return Boolean(inputPath) && path.isAbsolute(inputPath) && fs.existsSync(inputPath);
}

function readPackageVersion(): string {
  const serverDist = path.dirname(fileURLToPath(import.meta.url));
  const packagePath = path.resolve(serverDist, "../package.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

export async function startServer(options: ServerOptions = {}) {
  const port = options.port ?? Number(process.env.REPOSPEND_PORT ?? 2005);
  const host = options.host ?? "127.0.0.1";
  const candidatePorts = portCandidates(port, options.portFallbackCount ?? 20);
  let lastError: unknown;

  for (const candidatePort of candidatePorts) {
    const app = createServer(options);
    try {
      await app.listen({ host, port: candidatePort });
      return { app, url: `http://localhost:${candidatePort}`, port: candidatePort };
    } catch (error) {
      await app.close().catch(() => undefined);
      lastError = error;
      if (!isAddressInUse(error)) throw error;
    }
  }

  throw lastError;
}

function portCandidates(startPort: number, fallbackCount: number): number[] {
  if (!Number.isInteger(startPort) || startPort <= 0 || startPort > 65535) return [2005];
  const count = Math.max(0, Math.min(fallbackCount, 100));
  return Array.from({ length: count + 1 }, (_value, index) => startPort + index).filter((port) => port <= 65535);
}

function isAddressInUse(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "EADDRINUSE");
}

function isProtectedLocalMutation(method: string, url: string): boolean {
  if (method !== "PUT" && method !== "POST" && method !== "DELETE") return false;
  return url.startsWith("/api/settings/") || url.startsWith("/api/cache/");
}

function isAllowedLocalHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostFromHeader(hostHeader).toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isAllowedLocalOrigin(originHeader: string | undefined): boolean {
  if (!originHeader) return true;
  try {
    return isAllowedLocalHost(new URL(originHeader).host);
  } catch {
    return false;
  }
}

function hostFromHeader(hostHeader: string): string {
  const value = hostHeader.trim();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end >= 0 ? value.slice(1, end) : value;
  }
  const colonCount = (value.match(/:/g) ?? []).length;
  if (colonCount === 1) return value.slice(0, value.indexOf(":"));
  return value;
}

function validatePricingBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected JSON body with a models object.");
  }
  const models = (body as { models?: unknown }).models;
  if (!models || typeof models !== "object" || Array.isArray(models)) {
    throw new Error("Expected JSON body with a models object.");
  }

  const validated: Record<string, { inputPerMillion: number; cachedInputPerMillion?: number; cacheCreationInput5mPerMillion?: number; cacheCreationInput1hPerMillion?: number; cacheCreationInputPerMillion?: number; outputPerMillion: number; reasoningOutputPerMillion?: number; note?: string }> = {};
  for (const [model, value] of Object.entries(models as Record<string, unknown>)) {
    if (!model.trim() || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const inputPerMillion = finiteNumber(row.inputPerMillion);
    const outputPerMillion = finiteNumber(row.outputPerMillion);
    if (inputPerMillion === undefined || outputPerMillion === undefined) continue;
    const modelPricing: { inputPerMillion: number; cachedInputPerMillion?: number; cacheCreationInput5mPerMillion?: number; cacheCreationInput1hPerMillion?: number; cacheCreationInputPerMillion?: number; outputPerMillion: number; reasoningOutputPerMillion?: number; note?: string } = {
      inputPerMillion,
      outputPerMillion,
    };
    const cachedInputPerMillion = finiteNumber(row.cachedInputPerMillion);
    const cacheCreationInput5mPerMillion = finiteNumber(row.cacheCreationInput5mPerMillion);
    const cacheCreationInput1hPerMillion = finiteNumber(row.cacheCreationInput1hPerMillion);
    const cacheCreationInputPerMillion = finiteNumber(row.cacheCreationInputPerMillion);
    const reasoningOutputPerMillion = finiteNumber(row.reasoningOutputPerMillion);
    if (cachedInputPerMillion !== undefined) modelPricing.cachedInputPerMillion = cachedInputPerMillion;
    if (cacheCreationInput5mPerMillion !== undefined) modelPricing.cacheCreationInput5mPerMillion = cacheCreationInput5mPerMillion;
    if (cacheCreationInput1hPerMillion !== undefined) modelPricing.cacheCreationInput1hPerMillion = cacheCreationInput1hPerMillion;
    if (cacheCreationInputPerMillion !== undefined) modelPricing.cacheCreationInputPerMillion = cacheCreationInputPerMillion;
    if (reasoningOutputPerMillion !== undefined) modelPricing.reasoningOutputPerMillion = reasoningOutputPerMillion;
    if (typeof row.note === "string") modelPricing.note = row.note;
    validated[model] = modelPricing;
  }
  return validated;
}

function validateConfigBody(body: unknown): RepoSpendConfig {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const input = body as Record<string, unknown>;
  const config: RepoSpendConfig = {};
  if (Array.isArray(input.repos)) config.repos = input.repos as NonNullable<RepoSpendConfig["repos"]>;
  if (typeof input.pricingPath === "string") config.pricingPath = input.pricingPath;
  const experimentalSources = input.experimentalSources;
  if (experimentalSources && typeof experimentalSources === "object" && !Array.isArray(experimentalSources)) {
    config.experimentalSources = {
      cursor: (experimentalSources as Record<string, unknown>).cursor === true,
    };
  }
  return config;
}

function warmCacheFilters(): UsageFilters {
  const days = 30;
  const now = new Date();
  return {
    from: dateOnly(new Date(now.getTime() - days * 24 * 60 * 60 * 1000)),
    to: dateOnly(now),
  };
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function finiteNumber(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
