import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBugReportApi } from "./src/bugReportApi.js";
import {
  BodyTooLargeError,
  getClientIp,
  getMimeType,
  getSecurityHeaders,
  readRequestBody,
  sendNodeResponse,
} from "./src/http.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(currentDir, "public");
const api = createBugReportApi();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname;

  if (pathname === "/api/report") {
    try {
      const result = await api.handle({
        method: request.method ?? "GET",
        origin: request.headers.origin,
        ip: getClientIp(request.headers, request.socket.remoteAddress),
        userAgent: request.headers["user-agent"],
        rawBody: await readRequestBody(request),
      });

      sendNodeResponse(response, result);
    } catch (error) {
      const isLargeBody = error instanceof BodyTooLargeError;

      sendNodeResponse(response, {
        status: isLargeBody ? 413 : 500,
        headers: {
          ...getSecurityHeaders(),
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          error: isLargeBody
            ? "Bug reports are limited to 64 KB."
            : "Something went wrong while receiving this report.",
        }),
      });
    }

    return;
  }

  if (!["GET", "HEAD"].includes(request.method ?? "GET")) {
    sendNodeResponse(response, {
      status: 405,
      headers: {
        ...getSecurityHeaders(),
        allow: "GET, HEAD, POST, OPTIONS",
      },
      body: "Method not allowed",
    });
    return;
  }

  const filePath = resolveStaticFile(pathname);

  if (!filePath) {
    sendNodeResponse(response, {
      status: 404,
      headers: getSecurityHeaders(),
      body: "Not found",
    });
    return;
  }

  try {
    await access(filePath);
    const fileContents = await readFile(filePath);

    sendNodeResponse(response, {
      status: 200,
      headers: {
        ...getSecurityHeaders(),
        "content-type": getMimeType(filePath),
        "cache-control": filePath.endsWith(".html")
          ? "no-store"
          : "public, max-age=86400",
      },
      body: request.method === "HEAD" ? null : fileContents,
    });
  } catch {
    sendNodeResponse(response, {
      status: 404,
      headers: getSecurityHeaders(),
      body: "Not found",
    });
  }
});

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host =
  process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

server.listen(port, host, () => {
  console.log(`JobFinder beta bug app listening on http://${host}:${port}`);
});

function resolveStaticFile(pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const candidate = path.join(publicDir, normalizedPath);

  if (!candidate.startsWith(publicDir)) {
    return null;
  }

  return candidate;
}
