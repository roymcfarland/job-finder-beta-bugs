import { getSessionResult } from "./apiSession.js";
import { ValidationError } from "./bugReportSchema.js";
import { BugReportConfigurationError } from "./bugReportService.js";
import { getConfig } from "./config.js";
import {
  buildApiHeaders,
  isJsonContentType,
  jsonResponse,
  methodNotAllowedResponse,
  parseJsonObject,
} from "./http.js";
import { getErrorContext } from "./logger.js";
import { createRateLimitStore } from "./rateLimitStore.js";

export function createBugReportApi(options = {}) {
  const config = options.config ?? getConfig();
  const logger = options.logger ?? console;
  const authService = options.authService;
  const bugReportService = options.bugReportService;
  const rateLimiter =
    options.rateLimiter ??
    createRateLimitStore({
      limit: config.reportRateLimitMax,
      windowMs: config.reportRateLimitWindowMs,
    });

  return {
    async handle(request) {
      const headers = buildApiHeaders(config.allowedOrigin, request.origin);

      if (request.method === "OPTIONS") {
        return {
          status: 204,
          headers,
          body: null,
        };
      }

      const sessionResult = await getSessionResult({
        authService,
        cookieHeader: request.cookieHeader,
        headers,
      });
      if (sessionResult.response) {
        return sessionResult.response;
      }

      const session = sessionResult.session;
      if (!session?.user) {
        return jsonResponse(401, { error: "Unauthorized." }, headers);
      }

      if (request.pathname === "/api/reports") {
        if (request.method !== "GET") {
          return methodNotAllowedResponse(headers, "GET, OPTIONS");
        }

        try {
          const reports = await bugReportService.listForUser(session.user.id);
          return jsonResponse(200, { reports }, headers);
        } catch (error) {
          if (error instanceof BugReportConfigurationError) {
            return jsonResponse(503, { error: error.message }, headers);
          }

          throw error;
        }
      }

      if (request.pathname !== "/api/report") {
        return jsonResponse(404, { error: "Not found." }, headers);
      }

      if (request.method !== "POST") {
        return methodNotAllowedResponse(headers, "POST, OPTIONS");
      }

      if (!isJsonContentType(request.contentType)) {
        return jsonResponse(
          415,
          { error: "Send requests with Content-Type: application/json." },
          headers,
        );
      }

      let payload;

      try {
        payload = parseJsonObject(request.rawBody);
      } catch {
        return jsonResponse(400, { error: "Send a valid JSON payload." }, headers);
      }

      const rateLimitResult = rateLimiter.consume(request.ip || "unknown", Date.now());
      if (!rateLimitResult.allowed) {
        return jsonResponse(
          429,
          { error: "Too many reports from this connection. Please try again shortly." },
          {
            ...headers,
            "retry-after": String(rateLimitResult.retryAfterSeconds),
          },
        );
      }

      try {
        const result = await bugReportService.submit({
          user: session.user,
          payload,
          userAgent: request.userAgent,
        });

        return jsonResponse(
          201,
          {
            message: "Thanks, your bug report is in.",
            reportId: result.reportId,
            notificationMode: result.notificationMode,
          },
          headers,
        );
      } catch (error) {
        if (error instanceof ValidationError) {
          return jsonResponse(
            400,
            {
              error: error.message,
              fieldErrors: error.fieldErrors,
            },
            headers,
          );
        }

        if (error instanceof BugReportConfigurationError) {
          return jsonResponse(503, { error: error.message }, headers);
        }

        logError(logger, "Bug report submission failed.", error);
        return jsonResponse(
          500,
          { error: "Something went wrong while saving this report." },
          headers,
        );
      }
    },
  };
}

function logError(logger, message, error) {
  const log = logger.error ?? logger.log;
  if (typeof log === "function") {
    log.call(logger, message, getErrorContext(error));
  }
}
