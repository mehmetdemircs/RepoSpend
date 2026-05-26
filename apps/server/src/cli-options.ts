import type { UsageFilters } from "@repospend/types";
import type { DashboardReadOptions } from "./data.js";

export function parseCliFilters(args: string[]): UsageFilters {
  const filters: UsageFilters = {};
  const source = listOption(args, ["--source"]).filter((value) => value !== "all");
  const sourceApp = listOption(args, ["--sourceApp", "--source-app", "--app"]);
  const repo = listOption(args, ["--repo"]);
  const model = listOption(args, ["--model"]);
  const from = valueAfter(args, "--from");
  const to = valueAfter(args, "--to");
  if (source.length) filters.source = source;
  if (sourceApp.length) filters.sourceApp = sourceApp;
  if (repo.length) filters.repo = repo;
  if (model.length) filters.model = model;
  if (from) filters.from = from;
  if (to) filters.to = to;
  return filters;
}

export function parseCliDateFilters(args: string[]): UsageFilters {
  const filters: UsageFilters = {};
  const from = valueAfter(args, "--from");
  const to = valueAfter(args, "--to");
  if (from) filters.from = from;
  if (to) filters.to = to;
  return filters;
}

export function parseCliDashboardOptions(args: string[]): DashboardReadOptions {
  return {
    splitSourceApps: args.includes("--splitSourceApps") || args.includes("--split-source-apps"),
  };
}

export function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function listOption(args: string[], flags: string[]): string[] {
  const values: string[] = [];
  for (const flag of flags) {
    args.forEach((arg, index) => {
      if (arg === flag) {
        const value = args[index + 1];
        if (value && !value.startsWith("--")) values.push(value);
      } else if (arg.startsWith(`${flag}=`)) {
        values.push(arg.slice(flag.length + 1));
      }
    });
  }
  return [...new Set(values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))];
}
