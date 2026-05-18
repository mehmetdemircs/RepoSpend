import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "apps", "web", "dist");
const target = path.join(root, "web-dist");

if (!fs.existsSync(source)) {
  throw new Error("apps/web/dist is missing. Run pnpm build before packaging.");
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
