import { createServer } from "node:http";

import { createApp } from "./src/app.js";
import { loadEnvFiles } from "./src/loadEnv.js";
import { createLogger, getErrorContext } from "./src/logger.js";

loadEnvFiles();

const logger = createLogger();
const app = createApp({ logger });
const server = createServer((request, response) => {
  app.handleNodeRequest(request, response);
});

const port = parsePort(process.env.PORT);
const host =
  process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

server.on("error", (error) => {
  logger.error("Server failed to start.", getErrorContext(error));
  // Force exit so a bind failure (port in use, permission denied, etc.) can't
  // leave the process alive but unreachable once we add other async handles.
  process.exit(1);
});

server.listen(port, host, () => {
  logger.info("JobFinder beta bug app listening.", {
    url: `http://${host}:${port}`,
  });
});

function parsePort(value) {
  const parsed = Number.parseInt(value ?? "3000", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 3000;
}
