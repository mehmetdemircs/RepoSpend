#!/usr/bin/env node
import { spawn } from "node:child_process";
import { groupByDay, groupByHour, groupByModel, groupByRepo, groupBySourceApp, toCsv } from "@repospend/core";
import { exportJson, readDashboardData } from "./data.js";
import { startServer } from "./server.js";

const [command = "serve", ...args] = process.argv.slice(2);

try {
  if (command === "serve") {
    const { url } = await startServer({ port: Number(process.env.REPOSPEND_PORT ?? 2005), serveWeb: true });
    console.log(`RepoSpend dashboard: ${url}`);
    openBrowser(url);
  } else if (command === "scan") {
    const data = readDashboardData();
    console.log(JSON.stringify({ sources: data.sources, sessionCount: data.sessions.length, summary: data.summary }, null, 2));
  } else if (command === "by-repo") {
    printGroups(groupByRepo(readDashboardData().sessions));
  } else if (command === "by-day") {
    printGroups(groupByDay(readDashboardData().sessions));
  } else if (command === "by-hour") {
    printGroups(groupByHour(readDashboardData().sessions));
  } else if (command === "by-model") {
    printGroups(groupByModel(readDashboardData().sessions));
  } else if (command === "by-app") {
    printGroups(groupBySourceApp(readDashboardData().sessions));
  } else if (command === "export") {
    const format = valueAfter(args, "--format") ?? "json";
    const sessions = readDashboardData().sessions;
    console.log(format === "csv" ? toCsv(sessions) : exportJson());
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
    console.log("No usage found. Scanned ~/.codex/state_5.sqlite and ~/.codex/sessions.");
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

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function printHelp(): void {
  console.log(`RepoSpend commands:
  repospend serve
  repospend scan
  repospend by-repo
  repospend by-day
  repospend by-hour
  repospend by-model
  repospend by-app
  repospend export --format json
  repospend export --format csv`);
}
