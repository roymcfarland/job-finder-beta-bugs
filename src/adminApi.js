import {
  AdminActionError,
  AdminConfigurationError,
  AdminNotFoundError,
  AdminPermissionError,
} from "./adminService.js";
import { getSessionResult } from "./apiSession.js";
import {
  buildApiHeaders,
  jsonResponse,
  methodNotAllowedResponse,
  parseJsonObject,
} from "./http.js";

export function createAdminApi(options) {
  const { config, authService, adminService } = options;

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

          const comments = await adminService.listComments({
            userId: request.searchParams.get("userId") || "",
            status: request.searchParams.get("status") || "all",
          });

          return jsonResponse(200, { comments }, headers);
        }

        if (request.pathname === "/api/admin/comments/status") {
          if (request.method !== "POST") {
            return methodNotAllowedResponse(headers, "POST, OPTIONS");
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
