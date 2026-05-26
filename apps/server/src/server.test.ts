import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "./server.js";

describe("server local mutation guard", () => {
  let repospendHome: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.REPOSPEND_HOME;
    repospendHome = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-server-test-"));
    process.env.REPOSPEND_HOME = repospendHome;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.REPOSPEND_HOME;
    else process.env.REPOSPEND_HOME = previousHome;
    fs.rmSync(repospendHome, { recursive: true, force: true });
  });

  it("blocks mutating settings routes from non-local hosts", async () => {
    const app = createServer({ serveWeb: false });
    const response = await app.inject({
      method: "PUT",
      url: "/api/settings/config",
      headers: { host: "example.com", origin: "http://example.com", "content-type": "application/json" },
      payload: JSON.stringify({ experimentalSources: { cursor: true } }),
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(fs.existsSync(path.join(repospendHome, "config.json"))).toBe(false);
  });

  it("blocks mutating settings routes from non-local origins", async () => {
    const app = createServer({ serveWeb: false });
    const response = await app.inject({
      method: "PUT",
      url: "/api/settings/config",
      headers: { host: "localhost:2005", origin: "http://example.com", "content-type": "application/json" },
      payload: JSON.stringify({ experimentalSources: { cursor: true } }),
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(fs.existsSync(path.join(repospendHome, "config.json"))).toBe(false);
  });

  it("allows mutating settings routes from localhost", async () => {
    const app = createServer({ serveWeb: false });
    const response = await app.inject({
      method: "PUT",
      url: "/api/settings/config",
      headers: { host: "localhost:2005", origin: "http://localhost:2005", "content-type": "application/json" },
      payload: JSON.stringify({ experimentalSources: { cursor: true } }),
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(fs.readFileSync(path.join(repospendHome, "config.json"), "utf8"))).toEqual({ experimentalSources: { cursor: true } });
  });
});
