import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { pricingInfo } from "@repospend/core";
import type { DashboardResponse } from "@repospend/types";
import { clearRepoSpendLocalData, exportCsv, exportJson, parseDashboardOptions, parseFilters, readDashboardData, readPricingData, writePricingData } from "./data.js";
import { demoModeEnabled, readDemoDashboardData, readDemoRtkGain } from "./demo-data.js";
import { readRtkGain } from "./rtk.js";

export interface ServerOptions {
  host?: string;
  port?: number;
  serveWeb?: boolean;
}

export function createServer(options: ServerOptions = {}) {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({ ok: true, app: "RepoSpend", version: readPackageVersion() }));

  app.get("/api/dashboard", async (request): Promise<DashboardResponse> => {
    const query = request.query as Record<string, unknown>;
    const filters = parseFilters(query);
    const dashboardOptions = parseDashboardOptions(query);
    const demoMode = demoModeEnabled();
    const data = demoMode ? readDemoDashboardData(filters, dashboardOptions) : readDashboardData(filters, dashboardOptions);
    const rtkGain = demoMode ? readDemoRtkGain() : await readRtkGain();
    return {
      ...data,
      appVersion: readPackageVersion(),
      summary: { ...data.summary, skippedZeroTokenSessions: data.skippedZeroTokenSessions },
      pricing: {
        info: pricingInfo,
        ...readPricingData(),
      },
      rtkGain,
    };
  });

  app.put("/api/settings/pricing", async (request) => ({
    info: pricingInfo,
    ...writePricingData(validatePricingBody(request.body)),
  }));

  app.delete("/api/settings/local-data", async () => clearRepoSpendLocalData());

  app.get("/api/export.json", async (_request, reply) => {
    reply.header("content-type", "application/json; charset=utf-8");
    return exportJson();
  });

  app.get("/api/export.csv", async (_request, reply) => {
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", "attachment; filename=\"repospend-export.csv\"");
    return exportCsv();
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
  const app = createServer(options);
  await app.listen({ host, port });
  return { app, url: `http://localhost:${port}` };
}

function validatePricingBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected JSON body with a models object.");
  }
  const models = (body as { models?: unknown }).models;
  if (!models || typeof models !== "object" || Array.isArray(models)) {
    throw new Error("Expected JSON body with a models object.");
  }

  const validated: Record<string, { inputPerMillion: number; cachedInputPerMillion?: number; cacheCreationInputPerMillion?: number; outputPerMillion: number; reasoningOutputPerMillion?: number; note?: string }> = {};
  for (const [model, value] of Object.entries(models as Record<string, unknown>)) {
    if (!model.trim() || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const inputPerMillion = finiteNumber(row.inputPerMillion);
    const outputPerMillion = finiteNumber(row.outputPerMillion);
    if (inputPerMillion === undefined || outputPerMillion === undefined) continue;
    const modelPricing: { inputPerMillion: number; cachedInputPerMillion?: number; cacheCreationInputPerMillion?: number; outputPerMillion: number; reasoningOutputPerMillion?: number; note?: string } = {
      inputPerMillion,
      outputPerMillion,
    };
    const cachedInputPerMillion = finiteNumber(row.cachedInputPerMillion);
    const cacheCreationInputPerMillion = finiteNumber(row.cacheCreationInputPerMillion);
    const reasoningOutputPerMillion = finiteNumber(row.reasoningOutputPerMillion);
    if (cachedInputPerMillion !== undefined) modelPricing.cachedInputPerMillion = cachedInputPerMillion;
    if (cacheCreationInputPerMillion !== undefined) modelPricing.cacheCreationInputPerMillion = cacheCreationInputPerMillion;
    if (reasoningOutputPerMillion !== undefined) modelPricing.reasoningOutputPerMillion = reasoningOutputPerMillion;
    if (typeof row.note === "string") modelPricing.note = row.note;
    validated[model] = modelPricing;
  }
  return validated;
}

function finiteNumber(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
