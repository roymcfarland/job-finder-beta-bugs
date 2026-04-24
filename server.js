import { createServer } from "node:http";

import { createApp } from "./src/app.js";
import { loadEnvFiles } from "./src/loadEnv.js";

loadEnvFiles();

const app = createApp();
const server = createServer((request, response) => {
  app.handleNodeRequest(request, response);
});

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host =
  process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

server.listen(port, host, () => {
  console.log(`JobFinder beta bug app listening on http://${host}:${port}`);
});
