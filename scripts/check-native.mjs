#!/usr/bin/env node
import { createRequire } from "node:module";

const requireFromCore = createRequire(new URL("../packages/core/package.json", import.meta.url));

try {
  requireFromCore("better-sqlite3");
  console.log(`Native SQLite OK for ${process.version} ABI=${process.versions.modules}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Native SQLite check failed for ${process.version} ABI=${process.versions.modules}.`);
  if (message.includes("NODE_MODULE_VERSION")) {
    const builtAbi = message.match(/NODE_MODULE_VERSION\s+(\d+)/)?.[1] ?? "unknown";
    const requiredAbi = message.match(/requires\s+NODE_MODULE_VERSION\s+(\d+)/)?.[1] ?? process.versions.modules;
    console.error(`better-sqlite3 was built for ABI ${builtAbi}, but this Node requires ABI ${requiredAbi}.`);
    console.error("Fix: run `pnpm rebuild:native` in this same terminal, then run `pnpm dev` again.");
    console.error("If you changed Node versions, run `pnpm install` again after selecting the Node version you want.");
  } else {
    console.error(message);
  }
  process.exit(1);
}
