import { buildBugReportSubmission, ValidationError } from "./bugReportSchema.js";
import { getConfig } from "./config.js";
import { getSecurityHeaders } from "./http.js";
import { createRateLimitStore } from "./rateLimitStore.js";
import { createDeliveryService } from "./reportDelivery.js";

export function createBugReportApi(options = {}) {
  const config = options.config ?? getConfig();
  const now = options.now ?? (() => Date.now());
  const logger = options.logger ?? console;
  const rateLimiter =
    options.rateLimiter ??
    createRateLimitStore({
      limit: config.rateLimitMax,
      windowMs: config.rateLimitWindowMs,
    });
  const delivery = options.delivery ?? createDeliveryService(config, options);

  return {
    async handle(request) {
      const headers = buildResponseHeaders(config.allowedOrigin, request.origin);

      if (request.method === "OPTIONS") {
        return {
          status: 204,
          headers,
          body: null,
        };
      }

      if (request.method !== "POST") {
        return jsonResponse(
          405,
          { error: "Method not allowed." },
          {
            ...headers,
            allow: "POST, OPTIONS",
          },
        );
      }

      let payload;

      try {
        payload = parseJsonObject(request.rawBody);
      } catch (error) {
        logger.warn("Invalid bug-report payload", error);
        return jsonResponse(400, { error: "Send a valid JSON payload." }, headers);
      }

      const rateLimitResult = rateLimiter.consume(request.ip || "unknown", now());
      if (!rateLimitResult.allowed) {
        return jsonResponse(
          429,
          {
            error: "Too many reports from this connection. Please try again shortly.",
          },
          {
            ...headers,
            "retry-after": String(rateLimitResult.retryAfterSeconds),
          },
        );
      }

      let report;

      try {
        report = buildBugReportSubmission(payload, {
          now: new Date(now()),
          userAgent: request.userAgent,
        });
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

        logger.error("Failed to validate bug report", error);
        return jsonResponse(
          500,
          { error: "Something went wrong while validating this report." },
          headers,
        );
      }

      try {
        const deliveryResult = await delivery.send(report);

        return jsonResponse(
          201,
          {
            message: "Thanks, your bug report is in.",
            reportId: report.meta.submissionId,
            deliveryMode: deliveryResult.mode,
          },
          headers,
        );
      } catch (error) {
        logger.error("Bug report delivery failed", error);

        return jsonResponse(
          503,
          {
            error:
              "Bug report delivery is temporarily unavailable. Please try again in a few minutes.",
          },
          headers,
        );
      }
    },
  };
}

function parseJsonObject(rawBody) {
  if (!rawBody) {
    throw new Error("Request body is empty.");
  }

  const parsed = JSON.parse(rawBody);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object.");
  }

  return parsed;
}

function buildResponseHeaders(allowedOrigin, requestOrigin) {
  const corsHeaders =
    allowedOrigin && requestOrigin === allowedOrigin
      ? {
          "access-control-allow-origin": allowedOrigin,
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "POST, OPTIONS",
        }
      : {};

  return {
    ...getSecurityHeaders(),
    ...corsHeaders,
    "content-type": "application/json; charset=utf-8",
  };
}

function jsonResponse(status, payload, headers) {
  return {
    status,
    headers,
    body: JSON.stringify(payload),
  };
}
