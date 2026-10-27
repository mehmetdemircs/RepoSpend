import fs from "node:fs";
import net from "node:net";
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

describe("server local read guard", () => {
  let repospendHome: string;
  let previousHome: string | undefined;
  let previousDemo: string | undefined;

  beforeEach(() => {
    previousHome = process.env.REPOSPEND_HOME;
    previousDemo = process.env.REPOSPEND_DEMO_DATA;
    repospendHome = fs.mkdtempSync(path.join(os.tmpdir(), "repospend-server-read-"));
    process.env.REPOSPEND_HOME = repospendHome;
    process.env.REPOSPEND_DEMO_DATA = "lotr";
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.REPOSPEND_HOME;
    else process.env.REPOSPEND_HOME = previousHome;
    if (previousDemo === undefined) delete process.env.REPOSPEND_DEMO_DATA;
    else process.env.REPOSPEND_DEMO_DATA = previousDemo;
    fs.rmSync(repospendHome, { recursive: true, force: true });
  });

  it.each(["/api/dashboard", "/api/export.json", "/api/export.csv"])("blocks %s from a non-local Host", async (url) => {
    const app = createServer({ serveWeb: false });
    const response = await app.inject({ method: "GET", url, headers: { host: "example.com" } });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it.each([
    "/api/%64ashboard",
    "/api/das%68board",
    "/api/export%2ejson",
    "/api/export%2Ecsv",
    "/api/%65xport.json",
  ])("blocks the encoded sensitive path %s from a non-local Host", async (url) => {
    const app = createServer({ serveWeb: false });
    const response = await app.inject({ method: "GET", url, headers: { host: "example.com" } });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it.each(["/api/%64ashboard"])("allows the encoded sensitive path %s from a local Host", async (url) => {
    const app = createServer({ serveWeb: false });
    const response = await app.inject({ method: "GET", url, headers: { host: "localhost:2005" } });
    await app.close();

    expect(response.statusCode).toBe(200);
  });

  it.each(["/api/%64ashboard", "/api/export%2ejson"])("blocks encoded HEAD %s from a non-local Host", async (url) => {
    const app = createServer({ serveWeb: false });
    const response = await app.inject({ method: "HEAD", url, headers: { host: "example.com" } });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it.each(["localhost:2005", "127.0.0.1:2005", "[::1]:2005"])("allows /api/dashboard from local Host %s", async (host) => {
    const app = createServer({ serveWeb: false });
    const response = await app.inject({ method: "GET", url: "/api/dashboard", headers: { host } });
    await app.close();

    expect(response.statusCode).toBe(200);
  });

  it("allows a missing Host header so CLI and health checks keep working", async () => {
    const app = createServer({ serveWeb: false });
    const dashboard = await app.inject({ method: "GET", url: "/api/dashboard", headers: { host: "" } });
    const health = await app.inject({ method: "GET", url: "/api/health", headers: { host: "example.com" } });
    await app.close();

    expect(dashboard.statusCode).toBe(200);
    expect(health.statusCode).toBe(200);
  });

  it.each([
    "GET http://evil.example/api/dashboard HTTP/1.1",
    "HEAD http://evil.example/api/dashboard HTTP/1.1",
    "GET http://evil.example/api/export%2ejson HTTP/1.1",
  ])("blocks the absolute-form request target %s from a non-local Host", async (requestLine) => {
    const status = await withListeningServer(requestLine, "evil.example");
    expect(status).toBe(403);
  });

  it("blocks the absolute-form mutation target from a non-local Host", async () => {
    const status = await withListeningServer("PUT http://evil.example/api/settings/pricing HTTP/1.1", "evil.example", '{"x":{}}');
    expect(status).toBe(403);
  });

  it("allows absolute-form sensitive reads from a local Host", async () => {
    const app = createServer({ serveWeb: false });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as { port: number }).port;
    const status = await rawRequest(port, "GET http://localhost/api/dashboard HTTP/1.1", "localhost");
    await app.close();

    expect(status).toBe(200);
  });
});

async function withListeningServer(requestLine: string, host: string, body?: string): Promise<number> {
  const app = createServer({ serveWeb: false });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = (app.server.address() as { port: number }).port;
  const status = await rawRequest(port, requestLine, host, body);
  await app.close();
  return status;
}

// Sends a verbatim request-target (including absolute-form) over a raw socket so the
// guard is exercised on the same bytes the HTTP server and router actually receive.
async function rawRequest(port: number, requestLine: string, host: string, body?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" }, () => {
      const headers = [`Host: ${host}`, "Connection: close"];
      if (body !== undefined) headers.push("Content-Type: application/json", `Content-Length: ${Buffer.byteLength(body)}`);
      socket.write(`${requestLine}\r\n${headers.join("\r\n")}\r\n\r\n${body ?? ""}`);
    });
    let response = "";
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
    });
    socket.on("end", () => {
      const status = Number(response.split(" ")[1]);
      resolve(status);
    });
    socket.on("error", reject);
  });
}
