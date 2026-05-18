import { startServer } from "./server.js";

const { url } = await startServer({ port: 4318, serveWeb: false });
console.log(`RepoSpend API listening at ${url}`);
