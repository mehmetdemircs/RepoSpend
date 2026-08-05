import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RepoSpendConfig } from "@repospend/types";
import { aliasForPath } from "./config.js";
import type { FileSystemLike } from "./fs.js";

export interface RepoInfo {
  repoRoot: string;
  repoName: string;
  gitRemoteUrl: string | undefined;
  gitBranch: string | undefined;
  verified: boolean;
  warnings: string[];
}

function normalizeRoot(p: string): string {
  // Strip Windows extended-length path prefix (\\?\) before normalizing
  const stripped = p.startsWith("\\\\?\\") ? p.slice(4) : p;
  return stripped.replace(/^([a-zA-Z]):/, (_, letter: string) => letter.toUpperCase() + ":");
}

export function findGitRoot(cwd: string, fileSystem: Pick<FileSystemLike, "existsSync" | "statSync"> = fs): string | undefined {
  let current = normalizeRoot(path.resolve(cwd));

  while (true) {
    const gitPath = path.join(current, ".git");
    if (fileSystem.existsSync(gitPath)) {
      try {
        const stat = fileSystem.statSync(gitPath);
        if (stat.isDirectory() || stat.isFile()) {
          return current;
        }
      } catch {
        return current;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function resolveRepoInfo(cwd: string, config: RepoSpendConfig = {}, fileSystem: FileSystemLike = fs): RepoInfo {
  const warnings: string[] = [];
  const gitRoot = safeFindGitRoot(cwd, fileSystem);
  const repoRoot = gitRoot ?? fallbackWorkspaceRoot(cwd, fileSystem);
  const alias = aliasForPath(repoRoot, config);
  const repoName = alias ?? (gitRoot ? path.basename(repoRoot) : fallbackWorkspaceLabel(repoRoot));
  const gitMeta = gitRoot ? readGitMetadata(gitRoot, fileSystem) : { remote: undefined, branch: undefined };

  if (!gitRoot) {
    warnings.push("repo_unverified_no_git_root");
  }

  return {
    repoRoot,
    repoName,
    gitRemoteUrl: gitMeta.remote,
    gitBranch: gitMeta.branch,
    verified: Boolean(gitRoot),
    warnings,
  };
}

function safeFindGitRoot(cwd: string, fileSystem: Pick<FileSystemLike, "existsSync" | "statSync">): string | undefined {
  try {
    return findGitRoot(cwd, fileSystem);
  } catch {
    return undefined;
  }
}

const workspaceMarkers = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "mix.exs",
  "composer.json",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "Package.swift",
  "CMakeLists.txt",
];
const fallbackWorkspaceCache = new Map<string, string>();

export function fallbackWorkspaceRoot(cwd: string, fileSystem: Pick<FileSystemLike, "existsSync"> = fs): string {
  const resolved = normalizeRoot(path.resolve(cwd || process.cwd()));
  if (fileSystem === fs) {
    const cached = fallbackWorkspaceCache.get(resolved);
    if (cached) return cached;
  }
  const root = findWorkspaceMarkerRoot(resolved, fileSystem) ?? resolved;
  if (fileSystem === fs) fallbackWorkspaceCache.set(resolved, root);
  return root;
}

function findWorkspaceMarkerRoot(start: string, fileSystem: Pick<FileSystemLike, "existsSync">): string | undefined {
  const home = normalizeRoot(path.resolve(os.homedir()));
  const boundary = isWithin(start, home) ? home : path.parse(start).root;
  let candidate: string | undefined;
  let current = start;
  while (true) {
    if (current !== boundary && isAllowedMarkerRoot(current, boundary) && workspaceMarkers.some((marker) => fileSystem.existsSync(path.join(current, marker)))) {
      candidate = current;
    }
    if (current === boundary) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return candidate;
    current = parent;
  }
}

function isAllowedMarkerRoot(candidate: string, boundary: string): boolean {
  const relative = path.relative(boundary, candidate).split(path.sep).filter(Boolean);
  return relative.length > 1;
}

function isWithin(candidate: string, parent: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function fallbackWorkspaceLabel(repoRoot: string): string {
  const home = normalizeRoot(path.resolve(os.homedir()));
  const relativeToHome = path.relative(home, repoRoot);
  if (relativeToHome && !relativeToHome.startsWith("..") && !path.isAbsolute(relativeToHome)) {
    return relativeToHome.split(path.sep).filter(Boolean).join("/");
  }
  return path.basename(repoRoot) || "unknown-workspace";
}

function readGitMetadata(repoRoot: string, fileSystem: FileSystemLike): { remote: string | undefined; branch: string | undefined } {
  const gitPath = path.join(repoRoot, ".git");
  try {
    const stat = fileSystem.statSync(gitPath);
    const gitDir = stat.isFile() ? resolveGitFile(repoRoot, fileSystem.readFileSync(gitPath, "utf8")) : gitPath;
    const configPath = path.join(gitDir, "config");
    const headPath = path.join(gitDir, "HEAD");
    const remote = fileSystem.existsSync(configPath) ? parseRemote(fileSystem.readFileSync(configPath, "utf8")) : undefined;
    const branch = fileSystem.existsSync(headPath) ? parseBranch(fileSystem.readFileSync(headPath, "utf8")) : undefined;
    return { remote, branch };
  } catch {
    return { remote: undefined, branch: undefined };
  }
}

function resolveGitFile(repoRoot: string, contents: string): string {
  const match = contents.match(/^gitdir:\s*(.+)$/m);
  if (!match?.[1]) {
    return path.join(repoRoot, ".git");
  }
  return path.resolve(repoRoot, match[1].trim());
}

function parseRemote(config: string): string | undefined {
  const originMatch = config.match(/\[remote "origin"\][\s\S]*?\n\s*url\s*=\s*(.+)/);
  return originMatch?.[1]?.trim();
}

function parseBranch(head: string): string | undefined {
  const match = head.trim().match(/^ref:\s+refs\/heads\/(.+)$/);
  return match?.[1] ?? head.trim().slice(0, 12);
}
