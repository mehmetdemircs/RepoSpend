import fs from "node:fs";
import path from "node:path";
import type { RepoSpendConfig } from "@repospend/types";
import { repospendHome } from "./pricing.js";

export function configPath(): string {
  return path.join(repospendHome(), "config.json");
}

export function loadConfig(): RepoSpendConfig {
  return loadConfigWithWarnings().config;
}

export function loadConfigWithWarnings(): { config: RepoSpendConfig; warnings: string[] } {
  const localConfigPath = configPath();
  if (!fs.existsSync(localConfigPath)) {
    return { config: {}, warnings: [] };
  }

  try {
    return { config: JSON.parse(fs.readFileSync(localConfigPath, "utf8")) as RepoSpendConfig, warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { config: {}, warnings: [`Unable to parse ${localConfigPath}: ${message}`] };
  }
}

export function normalizePathForMatch(inputPath: string): string {
  return path.resolve(inputPath).replace(/\/+$/, "");
}

export function aliasForPath(repoRoot: string, config: RepoSpendConfig): string | undefined {
  const resolvedRoot = normalizePathForMatch(repoRoot);
  const match = config.repos?.find((repo) =>
    repo.paths.some((repoPath) => {
      const candidate = normalizePathForMatch(repoPath);
      return resolvedRoot === candidate || resolvedRoot.startsWith(`${candidate}${path.sep}`);
    }),
  );
  return match?.name;
}
