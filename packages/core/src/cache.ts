import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { repospendHome } from "./pricing.js";

const activeCacheVersion = "parse-v1";
let preparedCacheRoot: string | undefined;

export function parseCacheRoot(): string {
  return path.join(repospendHome(), "cache", activeCacheVersion);
}

export function readJsonCache<T>(namespace: string, keyParts: unknown): T | undefined {
  const cachePath = cacheEntryPath(namespace, keyParts);
  if (!cachePath || !fs.existsSync(cachePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8")) as T;
  } catch {
    fs.rmSync(cachePath, { force: true });
    return undefined;
  }
}

export function writeJsonCache(namespace: string, keyParts: unknown, value: unknown): void {
  const cachePath = cacheEntryPath(namespace, keyParts);
  if (!cachePath) return;
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify(value)}\n`);
  } catch {
    // Cache writes are best-effort; source scans should never fail because of cache I/O.
  }
}

export function clearRepoSpendCache(): { path: string; removed: boolean } {
  const target = path.join(repospendHome(), "cache");
  const removed = fs.existsSync(target);
  fs.rmSync(target, { recursive: true, force: true });
  preparedCacheRoot = undefined;
  return { path: target, removed };
}

function cacheEntryPath(namespace: string, keyParts: unknown): string | undefined {
  prepareCacheRoot();
  const safeNamespace = namespace.replace(/[^a-z0-9_-]/gi, "-");
  const key = crypto.createHash("sha256").update(JSON.stringify(keyParts)).digest("hex");
  return path.join(parseCacheRoot(), safeNamespace, `${key}.json`);
}

function prepareCacheRoot(): void {
  const root = path.join(repospendHome(), "cache");
  if (preparedCacheRoot === root) return;
  preparedCacheRoot = root;
  try {
    fs.mkdirSync(parseCacheRoot(), { recursive: true });
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== activeCacheVersion) {
        fs.rmSync(path.join(root, entry.name), { recursive: true, force: true });
      }
    }
  } catch {
    // Cache cleanup is best-effort.
  }
}
