import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webSource = path.join(root, "apps", "web", "dist");
const webTarget = path.join(root, "web-dist");
const distDir = path.join(root, "dist");

if (!fs.existsSync(webSource)) {
  throw new Error("apps/web/dist is missing. Run `pnpm --filter @repospend/web build` before packaging.");
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.rmSync(webTarget, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.cpSync(webSource, webTarget, { recursive: true });

const aliases = new Map([
  ["@repospend/core", path.join(root, "packages", "core", "src", "index.ts")],
  ["@repospend/types", path.join(root, "packages", "types", "src", "index.ts")],
]);

await esbuild.build({
  entryPoints: [path.join(root, "apps", "server", "src", "cli.ts")],
  outfile: path.join(distDir, "cli.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["@fastify/static", "better-sqlite3", "fastify"],
  plugins: [
    {
      name: "repospend-workspace-aliases",
      setup(build) {
        build.onResolve({ filter: /^@repospend\/(core|types)$/ }, (args) => ({
          path: aliases.get(args.path),
        }));
      },
    },
  ],
});

fs.chmodSync(path.join(distDir, "cli.js"), 0o755);
