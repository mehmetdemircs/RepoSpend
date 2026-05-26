#!/usr/bin/env node
import { spawn } from "node:child_process";
import { groupByDay, groupByHour, groupByModel, groupByRepo, groupBySourceApp, toCsv } from "@repospend/core";
import { readDashboardData } from "./data.js";
import { parseCliDashboardOptions, parseCliDateFilters, parseCliFilters, valueAfter } from "./cli-options.js";
import { startServer } from "./server.js";

const [command = "serve", ...args] = process.argv.slice(2);

try {
  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
  } else if (command === "serve") {
    const requestedPort = Number(process.env.REPOSPEND_PORT ?? 2005);
    const { url, port } = await startServer({ port: requestedPort, serveWeb: true });
    if (port !== requestedPort) console.log(`Port ${requestedPort} is already in use; using ${port} instead.`);
    console.log(`RepoSpend dashboard: ${url}`);
    openBrowser(url);
  } else if (command === "__warm-cache") {
    readDashboardData(parseCliDateFilters(args), parseCliDashboardOptions(args));
  } else if (command === "scan") {
    const data = readDashboardData(parseCliFilters(args), parseCliDashboardOptions(args));
    console.log(JSON.stringify({ sources: data.sources, sessionCount: data.sessions.length, summary: data.summary }, null, 2));
  } else if (command === "by-repo") {
    printGroups(groupByRepo(readDashboardData(parseCliFilters(args), parseCliDashboardOptions(args)).sessions));
  } else if (command === "by-day") {
    printGroups(groupByDay(readDashboardData(parseCliFilters(args), parseCliDashboardOptions(args)).sessions));
  } else if (command === "by-hour") {
    printGroups(groupByHour(readDashboardData(parseCliFilters(args), parseCliDashboardOptions(args)).sessions));
  } else if (command === "by-model") {
    printGroups(groupByModel(readDashboardData(parseCliFilters(args), parseCliDashboardOptions(args)).sessions));
  } else if (command === "by-app") {
    printGroups(groupBySourceApp(readDashboardData(parseCliFilters(args), parseCliDashboardOptions(args)).sessions));
  } else if (command === "doctor") {
    printDoctor(readDashboardData(parseCliFilters(args), parseCliDashboardOptions(args)));
  } else if (command === "export") {
    const format = valueAfter(args, "--format") ?? "json";
    const filters = parseCliFilters(args);
    const sessions = readDashboardData(filters, parseCliDashboardOptions(args)).sessions;
    console.log(format === "csv" ? toCsv(sessions) : JSON.stringify(sessions, null, 2));
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function openBrowser(url: string): void {
  if (process.env.REPOSPEND_NO_OPEN === "1" || process.env.CI === "true") return;
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {
    // Opening the browser is best-effort; the printed URL is the fallback.
  });
  child.unref();
}

function printGroups(groups: ReturnType<typeof groupByRepo>): void {
  if (!groups.length) {
    console.log("No usage found. Scanned enabled local data paths.");
    return;
  }

  const rows = groups.map((group) => ({
    name: group.label,
    cost: group.estimatedCostUsd === undefined ? "unknown" : `$${group.estimatedCostUsd.toFixed(4)}`,
    tokens: group.totalTokens,
    sessions: group.sessionCount,
  }));
  console.table(rows);
}

function printDoctor(data: ReturnType<typeof readDashboardData>): void {
  const confidence = data.confidence;
  console.log(`RepoSpend data confidence: ${confidence.label} (${confidence.score}/100)`);
  console.table([
    { metric: "Sessions", value: confidence.sessionCount },
    { metric: "Token data coverage", value: `${Math.round(confidence.tokenDataPct * 100)}% (${confidence.tokenDataSessions}/${confidence.sessionCount})` },
    { metric: "Pricing coverage", value: `${Math.round(confidence.pricingCoveragePct * 100)}% (${confidence.pricedTokenSessions}/${confidence.tokenDataSessions})` },
    { metric: "Repo grouping", value: `${Math.round(confidence.verifiedRepoPct * 100)}% verified (${confidence.verifiedRepoSessions}/${confidence.sessionCount})` },
    { metric: "Parse issues", value: confidence.parseIssueCount },
    { metric: "Source warnings", value: confidence.sourceWarningCount },
  ]);
  if (confidence.issues.length) {
    console.table(confidence.issues.map((issue) => ({
      severity: issue.tone,
      issue: issue.title,
      detail: issue.detail,
      sessions: issue.affectedSessionIds.length,
    })));
  } else {
    console.log("No data-confidence issues detected.");
  }
  console.table(data.sourceStats.map((source) => ({
    source: source.sourceLabel ?? source.sourceId ?? "unknown",
    imported: source.sessionsImported ?? 0,
    files: source.sessionFileCount,
    parseIssues: source.parseFailureCount ?? 0,
    primaryData: sourcePrimaryDataFound(source) ? "found" : "missing",
  })));
}

function sourcePrimaryDataFound(source: ReturnType<typeof readDashboardData>["sourceStats"][number]): boolean {
  return Boolean(source.stateExists || source.sessionsExists || source.projectsExists || source.historyExists || source.otelExists || (source.otelFileCount ?? 0) > 0 || (source.databaseFileCount ?? 0) > 0);
}

function printHelp(): void {
  console.log(`RepoSpend commands:
  repospend serve
  repospend doctor
  repospend scan
  repospend by-repo
  repospend by-day
  repospend by-hour
  repospend by-model
  repospend by-app
  repospend export --format json
  repospend export --format csv

Options:
  --source all|codex|claude|copilot|cursor
  --sourceApp "VS Code" | --source-app "VS Code" | --app "VS Code"
  --repo <repo name or path>
  --model <model id>
  --from YYYY-MM-DD
  --to YYYY-MM-DD
  --split-source-apps

Cursor is experimental and only scans when enabled in ~/.repospend/config.json.`);
}
