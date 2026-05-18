import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RtkCommand, RtkCoverageGap, RtkGain, RtkUnhandledCommand } from "@repospend/types";

const execFileAsync = promisify(execFile);

export async function readRtkGain(): Promise<RtkGain> {
  try {
    const { stdout } = await execFileAsync("rtk", ["gain", "--history"], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const version = await readRtkVersion();
    const discover = await readRtkDiscover();
    return parseRtkGain(stdout, version, discover);
  } catch (error) {
    return {
      available: false,
      rtkDetected: false,
      rtkVersion: undefined,
      rtkCodexHookStatus: "not_detected",
      rtkLastActivityAt: undefined,
      rtkDataSource: undefined,
      totalCommands: undefined,
      inputTokens: undefined,
      outputTokens: undefined,
      tokensSaved: undefined,
      savedPercent: undefined,
      totalExecTime: undefined,
      averageExecTime: undefined,
      rtkTokensSaved: undefined,
      rtkSavingsRate: undefined,
      rtkCommandsProcessed: undefined,
      rtkAverageCommandRuntime: undefined,
      rtkTopSavingsCommands: [],
      rtkRecentActivity: [],
      rtkDiscoverAvailable: false,
      rtkDiscoverError: undefined,
      rtkDiscoverSummary: undefined,
      rtkCoverageGaps: [],
      rtkUnhandledCommands: [],
      topCommands: [],
      recentCommands: [],
      raw: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readRtkDiscover(): Promise<Pick<RtkGain, "rtkDiscoverAvailable" | "rtkDiscoverError" | "rtkDiscoverSummary" | "rtkCoverageGaps" | "rtkUnhandledCommands">> {
  try {
    const { stdout } = await execFileAsync("rtk", ["discover", "--all", "--since", "7"], {
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    });
    return parseRtkDiscover(stdout);
  } catch (error) {
    return {
      rtkDiscoverAvailable: false,
      rtkDiscoverError: error instanceof Error ? error.message : String(error),
      rtkDiscoverSummary: undefined,
      rtkCoverageGaps: [],
      rtkUnhandledCommands: [],
    };
  }
}

async function readRtkVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("rtk", ["--version"], {
      timeout: 1500,
      maxBuffer: 128 * 1024,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function parseRtkGain(
  raw: string,
  version: string | undefined,
  discover: Pick<RtkGain, "rtkDiscoverAvailable" | "rtkDiscoverError" | "rtkDiscoverSummary" | "rtkCoverageGaps" | "rtkUnhandledCommands">,
): RtkGain {
  const lines = raw.split(/\r?\n/);
  const savedLine = valueAfterLabel(lines, "Tokens saved");
  const execLine = valueAfterLabel(lines, "Total exec time");
  const totalCommands = numberFromText(valueAfterLabel(lines, "Total commands"));
  const tokensSaved = savedLine?.replace(/\s+\(.+\)$/, "");
  const savedPercent = percentFromText(savedLine);
  const averageExecTime = execLine?.match(/\(avg\s+(.+)\)/)?.[1];
  const topCommands = commandRows(lines);
  const recentCommands = recentCommandLines(lines);
  return {
    available: true,
    rtkDetected: true,
    rtkVersion: version,
    rtkCodexHookStatus: "unknown",
    rtkLastActivityAt: undefined,
    rtkDataSource: "rtk gain --history output",
    totalCommands,
    inputTokens: valueAfterLabel(lines, "Input tokens"),
    outputTokens: valueAfterLabel(lines, "Output tokens"),
    tokensSaved,
    savedPercent,
    totalExecTime: execLine?.replace(/\s+\(.+\)$/, ""),
    averageExecTime,
    rtkTokensSaved: tokensSaved,
    rtkSavingsRate: savedPercent,
    rtkCommandsProcessed: totalCommands,
    rtkAverageCommandRuntime: averageExecTime,
    rtkTopSavingsCommands: topCommands,
    rtkRecentActivity: recentCommands,
    ...discover,
    topCommands,
    recentCommands,
    raw,
    error: undefined,
  };
}

function parseRtkDiscover(raw: string): Pick<RtkGain, "rtkDiscoverAvailable" | "rtkDiscoverError" | "rtkDiscoverSummary" | "rtkCoverageGaps" | "rtkUnhandledCommands"> {
  const lines = raw.split(/\r?\n/);
  return {
    rtkDiscoverAvailable: true,
    rtkDiscoverError: undefined,
    rtkDiscoverSummary: lines.find((line) => line.trim().startsWith("Total:"))?.trim(),
    rtkCoverageGaps: coverageGapRows(lines),
    rtkUnhandledCommands: unhandledCommandRows(lines),
  };
}

function valueAfterLabel(lines: string[], label: string): string | undefined {
  const line = lines.find((candidate) => candidate.trim().startsWith(`${label}:`));
  return line?.split(":").slice(1).join(":").trim();
}

function numberFromText(value?: string): number | undefined {
  if (!value) return undefined;
  const number = Number(value.replaceAll(",", "").match(/\d+/)?.[0]);
  return Number.isFinite(number) ? number : undefined;
}

function percentFromText(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/([\d.]+)%/);
  return match?.[1] ? Number(match[1]) : undefined;
}

function commandRows(lines: string[]): RtkCommand[] {
  const start = lines.findIndex((line) => line.trim() === "By Command");
  const end = lines.findIndex((line, index) => index > start && line.trim() === "Recent Commands");
  if (start < 0) return [];
  return lines
    .slice(start + 1, end > start ? end : undefined)
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .flatMap((line) => {
      const withoutRank = line.replace(/^\d+\.\s+/, "");
      const columns = withoutRank.split(/\s{2,}/).filter(Boolean);
      const [command, count, saved, averageSavedPercent, time] = columns;
      if (!command) return [];
      return [{
        command,
        count: numberFromText(count),
        saved,
        averageSavedPercent: percentFromText(averageSavedPercent),
        time,
      }];
    });
}

function coverageGapRows(lines: string[]): RtkCoverageGap[] {
  const start = lines.findIndex((line) => line.trim().startsWith("MISSED SAVINGS"));
  const end = lines.findIndex((line, index) => index > start && line.trim().startsWith("Total:"));
  if (start < 0) return [];
  return lines
    .slice(start + 3, end > start ? end : undefined)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("─") && !line.startsWith("Command"))
    .flatMap((line) => {
      const match = line.match(/^(.+?)\s{2,}(\d+)\s{2,}(.+?)\s{2,}(.+?)\s{2,}(.+)$/);
      if (!match?.[1]) return [];
      return [{
        command: match[1].trim(),
        count: numberFromText(match[2]),
        rtkEquivalent: match[3]?.trim(),
        status: match[4]?.trim(),
        estimatedSavings: match[5]?.replace(/^~/, "").trim(),
      }];
    });
}

function unhandledCommandRows(lines: string[]): RtkUnhandledCommand[] {
  const start = lines.findIndex((line) => line.trim().startsWith("TOP UNHANDLED COMMANDS"));
  const end = lines.findIndex((line, index) => index > start && line.trim().startsWith("->"));
  if (start < 0) return [];
  return lines
    .slice(start + 3, end > start ? end : undefined)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("─") && !line.startsWith("Command"))
    .flatMap((line) => {
      const match = line.match(/^(.+?)\s{2,}(\d+)\s{2,}(.+)$/);
      if (!match?.[1]) return [];
      return [{
        command: match[1].trim(),
        count: numberFromText(match[2]),
        example: match[3]?.trim(),
      }];
    });
}

function recentCommandLines(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.trim() === "Recent Commands");
  if (start < 0) return [];
  return lines
    .slice(start + 2)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("─"))
    .slice(0, 6);
}
