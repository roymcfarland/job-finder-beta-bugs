import {
  AdminActionError,
  AdminConfigurationError,
  AdminNotFoundError,
  AdminPermissionError,
} from "./adminService.js";
import { getSessionResult } from "./apiSession.js";
import {
  buildApiHeaders,
  isJsonContentType,
  jsonResponse,
  methodNotAllowedResponse,
  parseJsonObject,
} from "./http.js";
import { createRateLimitStore } from "./rateLimitStore.js";
import { isUuid } from "./uuid.js";

export function createAdminApi(options) {
  const { config, authService, adminService } = options;
  const rateLimiter =
    options.rateLimiter ??
    createRateLimitStore({
      limit: config.adminRateLimitMax,
      windowMs: config.adminRateLimitWindowMs,
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

      if (session.user.role !== "admin") {
        return jsonResponse(403, { error: "Admin access required." }, headers);
      }

      const adminLimit = rateLimiter.consume(`admin:${request.ip || "unknown"}`, Date.now());
      if (!adminLimit.allowed) {
        return jsonResponse(
          429,
          { error: "Too many admin requests. Please try again shortly." },
          {
            ...headers,
            "retry-after": String(adminLimit.retryAfterSeconds),
          },
        );
      }

      try {
        if (request.pathname === "/api/admin/dashboard") {
          if (request.method !== "GET") {
            return methodNotAllowedResponse(headers, "GET, OPTIONS");
          }

          const dashboard = await adminService.getDashboardData();
          return jsonResponse(200, dashboard, headers);
        }

        if (request.pathname === "/api/admin/comments") {
          if (request.method !== "GET") {
            return methodNotAllowedResponse(headers, "GET, OPTIONS");
          }

          const filterUserId = (request.searchParams.get("userId") ?? "").trim();
          if (filterUserId && !isUuid(filterUserId)) {
            return jsonResponse(400, { error: "Invalid user id filter." }, headers);
          }

          const comments = await adminService.listComments({
            userId: filterUserId,
            status: request.searchParams.get("status") || "all",
          });

          return jsonResponse(200, { comments }, headers);
        }

        if (request.pathname === "/api/admin/audit-log") {
          if (request.method !== "GET") {
            return methodNotAllowedResponse(headers, "GET, OPTIONS");
          }

          const entries = await adminService.listAuditLog({
            limit: request.searchParams.get("limit"),
          });

          return jsonResponse(200, { entries }, headers);
        }

        if (request.pathname === "/api/admin/comments/status") {
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

          const { id: commentId, flag: resolved } = parseActionPayload(payload, {
            idField: "commentId",
            flagField: "resolved",
          });
          const comment = await adminService.setCommentResolved({
            adminUser: session.user,
            commentId,
            resolved,
          });

          return jsonResponse(200, { comment }, headers);
        }

        if (request.pathname === "/api/admin/users/status") {
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

          const { id: targetUserId, flag: disabled } = parseActionPayload(payload, {
            idField: "userId",
            flagField: "disabled",
          });
          const user = await adminService.setUserDisabled({
            adminUser: session.user,
            targetUserId,
            disabled,
          });

          return jsonResponse(200, { user }, headers);
        }

        return jsonResponse(404, { error: "Not found." }, headers);
      } catch (error) {
        if (error instanceof AdminConfigurationError) {
          return jsonResponse(503, { error: error.message }, headers);
        }

        if (error instanceof AdminPermissionError) {
          return jsonResponse(403, { error: error.message }, headers);
        }

        if (error instanceof AdminActionError) {
          return jsonResponse(400, { error: error.message }, headers);
        }

        if (error instanceof AdminNotFoundError) {
          return jsonResponse(404, { error: error.message }, headers);
        }

        throw error;
      }
    },
  };
}

function parseActionPayload(payload, { idField, flagField }) {
  const id = typeof payload[idField] === "string" ? payload[idField].trim() : "";
  if (!id) {
    throw new AdminActionError("Missing target id.");
  }

  if (typeof payload[flagField] !== "boolean") {
    throw new AdminActionError("Invalid action value.");
  }

  return {
    id,
    flag: payload[flagField],
  };
}
