import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAdminApi } from "./adminApi.js";
import { createAdminService } from "./adminService.js";
import { createAuthApi } from "./authApi.js";
import { createAuthService } from "./authService.js";
import { createBugReportApi } from "./bugReportApi.js";
import { createBugReportService } from "./bugReportService.js";
import { getConfig } from "./config.js";
import { createCronApi } from "./cronApi.js";
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
import { getErrorContext } from "./logger.js";
import { createNotificationService } from "./notifications.js";
import { createRateLimitStore } from "./rateLimitStore.js";
import { renderSocialMeta } from "./socialMeta.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(currentDir, "..", "public");
const templatesDir = path.join(currentDir, "..", "templates");
const templateCache = new Map();
// Caches the rendered HTML (template + social meta) keyed by `${fileName}|${baseUrl}`
// so we don't re-run the meta builder on every page load.
const renderedTemplateCache = new Map();

export function createApp(options = {}) {
  const config = options.config ?? getConfig();
  const logger = options.logger ?? console;

  // Loud warning rather than silent demotion: when the admin list is unset
  // synchronizeAdminRole leaves existing roles alone, so any account that
  // was already admin will keep admin access. Operators still need to know
  // because creating new admins requires this var to be configured.
  if (config.environment === "production" && config.adminEmails.length === 0) {
    logger.warn(
      "ADMIN_EMAILS is not configured; existing admin roles are preserved but new admins cannot be added.",
    );
  }
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
  const cronApi =
    options.cronApi ??
    createCronApi({
      config,
      logger: options.logger,
    });

  return {
    async handleNodeRequest(request, response) {
      try {
        const result = await routeRequest(request);
        sendNodeResponse(response, result);
      } catch (error) {
        const isLargeBody = error instanceof BodyTooLargeError;
        if (!isLargeBody) {
          logUnhandledRequestError(logger, request, error);
        }

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
      contentType: request.headers["content-type"],
      authorization: request.headers.authorization,
      ip: getClientIp(request.headers, request.socket.remoteAddress, {
        trustProxy: config.trustProxy,
      }),
      userAgent: request.headers["user-agent"],
    };

    if (pathname.startsWith("/api/")) {
      return await handleApiRequest(request, requestContext);
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
      return serveTemplate("landing.html", method, config);
    }

    if (pathname === "/reset-password") {
      return serveTemplate("reset-password.html", method, config);
    }

    if (pathname === "/dashboard") {
      const session = await authService.getSessionFromCookie(request.headers.cookie);

      if (!session?.user) {
        return redirectResponse("/", 302, {
          ...getSecurityHeaders(),
          "cache-control": "no-store",
        });
      }

      return serveTemplate("dashboard.html", method, config);
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

      return serveTemplate("admin.html", method, config);
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

    const fallbackHeaders = buildApiHeaders(config.allowedOrigin, requestContext.origin);

    try {
      if (requestContext.pathname.startsWith("/api/auth/")) {
        return await authApi.handle(apiRequest);
      }

      if (requestContext.pathname.startsWith("/api/admin/")) {
        return await adminApi.handle(apiRequest);
      }

      if (requestContext.pathname.startsWith("/api/cron/")) {
        return await cronApi.handle(apiRequest);
      }

      if (
        requestContext.pathname === "/api/report" ||
        requestContext.pathname === "/api/reports"
      ) {
        return await bugReportApi.handle(apiRequest);
      }

      return jsonResponse(404, { error: "Not found." }, fallbackHeaders);
    } catch (error) {
      logApiError(logger, requestContext, error);
      return jsonResponse(
        500,
        { error: "Something went wrong while handling this API request." },
        fallbackHeaders,
      );
    }
  }
}

async function serveTemplate(fileName, method, config) {
  const html = await getRenderedTemplate(fileName, config.baseUrl);

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

async function getRenderedTemplate(fileName, baseUrl) {
  const cacheKey = `${fileName}|${baseUrl}`;
  const cached = renderedTemplateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const html = renderSocialMeta(await loadTemplate(fileName), fileName, baseUrl);
  renderedTemplateCache.set(cacheKey, html);
  return html;
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
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "EISDIR") {
      throw error;
    }

    return {
      status: 404,
      headers: getSecurityHeaders(),
      body: "Not found",
    };
  }
}

function resolveStaticFile(pathname) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes("\0")) {
    return null;
  }

  const relativePath = decodedPath.replace(/^[/\\]+/, "");
  const candidate = path.resolve(publicDir, relativePath);
  const relativeToPublic = path.relative(publicDir, candidate);

  if (
    relativeToPublic === "" ||
    relativeToPublic.startsWith("..") ||
    path.isAbsolute(relativeToPublic)
  ) {
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

function logUnhandledRequestError(logger, request, error) {
  const log = logger.error ?? logger.log;
  if (typeof log !== "function") {
    return;
  }

  log.call(logger, "Unhandled request error.", {
    ...getErrorContext(error),
    method: request.method ?? "GET",
    pathname: getRequestPathname(request.url),
  });
}

function logApiError(logger, requestContext, error) {
  const log = logger.error ?? logger.log;
  if (typeof log !== "function") {
    return;
  }

  log.call(logger, "Unhandled API error.", {
    ...getErrorContext(error),
    method: requestContext.method ?? "GET",
    pathname: requestContext.pathname ?? "/",
  });
}

function getRequestPathname(rawUrl = "/") {
  try {
    return new URL(rawUrl, "http://127.0.0.1").pathname;
  } catch {
    return "/";
  }
}
