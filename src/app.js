import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAdminApi } from "./adminApi.js";
import { createAdminService } from "./adminService.js";
import { createAuthApi } from "./authApi.js";
import { createAuthService } from "./authService.js";
import { createBugReportApi } from "./bugReportApi.js";
import { createBugReportService } from "./bugReportService.js";
import { getConfig } from "./config.js";
import {
  BodyTooLargeError,
  buildApiHeaders,
  getClientIp,
  getMimeType,
  getSecurityHeaders,
  jsonResponse,
  readRequestBody,
  redirectResponse,
  sendNodeResponse,
} from "./http.js";
import { createNotificationService } from "./notifications.js";
import { createRateLimitStore } from "./rateLimitStore.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(currentDir, "..", "public");
const templatesDir = path.join(currentDir, "..", "templates");
const templateCache = new Map();

export function createApp(options = {}) {
  const config = options.config ?? getConfig();
  const notifications =
    options.notifications ?? createNotificationService(config, options);
  const authService =
    options.authService ??
    createAuthService({
      config,
      notifications,
      logger: options.logger,
      now: options.now,
    });
  const bugReportService =
    options.bugReportService ??
    createBugReportService({
      config,
      notifications,
      logger: options.logger,
      now: options.now,
    });
  const adminService =
    options.adminService ??
    createAdminService({
      config,
    });
  const authApi =
    options.authApi ??
    createAuthApi({
      config,
      authService,
      rateLimiter:
        options.authRateLimiter ??
        createRateLimitStore({
          limit: config.authRateLimitMax,
          windowMs: config.authRateLimitWindowMs,
        }),
    });
  const adminApi =
    options.adminApi ??
    createAdminApi({
      config,
      authService,
      adminService,
    });
  const bugReportApi =
    options.bugReportApi ??
    createBugReportApi({
      config,
      authService,
      bugReportService,
      logger: options.logger,
      rateLimiter:
        options.reportRateLimiter ??
        createRateLimitStore({
          limit: config.reportRateLimitMax,
          windowMs: config.reportRateLimitWindowMs,
        }),
    });

  return {
    async handleNodeRequest(request, response) {
      try {
        const result = await routeRequest(request);
        sendNodeResponse(response, result);
      } catch (error) {
        const isLargeBody = error instanceof BodyTooLargeError;

        sendNodeResponse(
          response,
          jsonResponse(
            isLargeBody ? 413 : 500,
            {
              error: isLargeBody
                ? "Requests are limited to 64 KB."
                : "Something went wrong while handling this request.",
            },
            {
              ...getSecurityHeaders(),
              "cache-control": "no-store",
            },
          ),
        );
      }
    },
  };

  async function routeRequest(request) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;
    const method = request.method ?? "GET";
    const requestContext = {
      pathname,
      method,
      origin: request.headers.origin,
      cookieHeader: request.headers.cookie,
      searchParams: url.searchParams,
      ip: getClientIp(request.headers, request.socket.remoteAddress),
      userAgent: request.headers["user-agent"],
    };

    if (pathname.startsWith("/api/")) {
      return handleApiRequest(request, requestContext);
    }

    if (!["GET", "HEAD"].includes(method)) {
      return {
        status: 405,
        headers: {
          ...getSecurityHeaders(),
          allow: "GET, HEAD",
        },
        body: "Method not allowed",
      };
    }

    if (pathname === "/") {
      return serveTemplate("landing.html", method);
    }

    if (pathname === "/reset-password") {
      return serveTemplate("reset-password.html", method);
    }

    if (pathname === "/dashboard") {
      const session = await authService.getSessionFromCookie(request.headers.cookie);

      if (!session?.user) {
        return redirectResponse("/", 302, {
          ...getSecurityHeaders(),
          "cache-control": "no-store",
        });
      }

      return serveTemplate("dashboard.html", method);
    }

    if (pathname === "/admin") {
      const session = await authService.getSessionFromCookie(request.headers.cookie);

      if (!session?.user) {
        return redirectResponse("/", 302, {
          ...getSecurityHeaders(),
          "cache-control": "no-store",
        });
      }

      if (session.user.role !== "admin") {
        return redirectResponse("/dashboard", 302, {
          ...getSecurityHeaders(),
          "cache-control": "no-store",
        });
      }

      return serveTemplate("admin.html", method);
    }

    return serveStaticAsset(pathname, method);
  }

  async function handleApiRequest(request, requestContext) {
    const rawBody =
      requestContext.method === "GET" ||
      requestContext.method === "HEAD" ||
      requestContext.method === "OPTIONS"
        ? ""
        : await readRequestBody(request);

    const apiRequest = {
      ...requestContext,
      rawBody,
    };

    if (requestContext.pathname.startsWith("/api/auth/")) {
      return authApi.handle(apiRequest);
    }

    if (requestContext.pathname.startsWith("/api/admin/")) {
      return adminApi.handle(apiRequest);
    }

    if (
      requestContext.pathname === "/api/report" ||
      requestContext.pathname === "/api/reports"
    ) {
      return bugReportApi.handle(apiRequest);
    }

    return jsonResponse(
      404,
      { error: "Not found." },
      buildApiHeaders(config.allowedOrigin, requestContext.origin),
    );
  }
}

async function serveTemplate(fileName, method) {
  const html = await loadTemplate(fileName);

  return {
    status: 200,
    headers: {
      ...getSecurityHeaders(),
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
    body: method === "HEAD" ? null : html,
  };
}

async function serveStaticAsset(pathname, method) {
  const filePath = resolveStaticFile(pathname);

  if (!filePath) {
    return {
      status: 404,
      headers: getSecurityHeaders(),
      body: "Not found",
    };
  }

  try {
    await access(filePath);
    const fileContents = await readFile(filePath);

    return {
      status: 200,
      headers: {
        ...getSecurityHeaders(),
        "content-type": getMimeType(filePath),
        "cache-control": "public, max-age=86400",
      },
      body: method === "HEAD" ? null : fileContents,
    };
  } catch {
    return {
      status: 404,
      headers: getSecurityHeaders(),
      body: "Not found",
    };
  }
}

function resolveStaticFile(pathname) {
  const normalizedPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const candidate = path.join(publicDir, normalizedPath);

  if (!candidate.startsWith(publicDir)) {
    return null;
  }

  return candidate;
}

async function loadTemplate(fileName) {
  if (!templateCache.has(fileName)) {
    const filePath = path.join(templatesDir, fileName);
    const contents = await readFile(filePath, "utf8");
    templateCache.set(fileName, contents);
  }

  return templateCache.get(fileName);
}
