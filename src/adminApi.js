import {
  AdminActionError,
  AdminConfigurationError,
  AdminNotFoundError,
  AdminPermissionError,
} from "./adminService.js";
import { buildApiHeaders, jsonResponse, parseJsonObject } from "./http.js";

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

      const session = await authService.getSessionFromCookie(request.cookieHeader);
      if (!session?.user) {
        return jsonResponse(401, { error: "Unauthorized." }, headers);
      }

      if (session.user.role !== "admin") {
        return jsonResponse(403, { error: "Admin access required." }, headers);
      }

      try {
        if (request.pathname === "/api/admin/dashboard") {
          if (request.method !== "GET") {
            return methodNotAllowed(headers);
          }

          const dashboard = await adminService.getDashboardData();
          return jsonResponse(200, dashboard, headers);
        }

        if (request.pathname === "/api/admin/comments") {
          if (request.method !== "GET") {
            return methodNotAllowed(headers);
          }

          const comments = await adminService.listComments({
            userId: request.searchParams.get("userId") || "",
            status: request.searchParams.get("status") || "all",
          });

          return jsonResponse(200, { comments }, headers);
        }

        if (request.pathname === "/api/admin/comments/status") {
          if (request.method !== "POST") {
            return methodNotAllowed(headers);
          }

          let payload;
          try {
            payload = parseJsonObject(request.rawBody);
          } catch {
            return jsonResponse(400, { error: "Send a valid JSON payload." }, headers);
          }

          const comment = await adminService.setCommentResolved({
            adminUser: session.user,
            commentId: String(payload.commentId || ""),
            resolved: Boolean(payload.resolved),
          });

          return jsonResponse(200, { comment }, headers);
        }

        if (request.pathname === "/api/admin/users/status") {
          if (request.method !== "POST") {
            return methodNotAllowed(headers);
          }

          let payload;
          try {
            payload = parseJsonObject(request.rawBody);
          } catch {
            return jsonResponse(400, { error: "Send a valid JSON payload." }, headers);
          }

          const user = await adminService.setUserDisabled({
            adminUser: session.user,
            targetUserId: String(payload.userId || ""),
            disabled: Boolean(payload.disabled),
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

function methodNotAllowed(headers) {
  return jsonResponse(
    405,
    { error: "Method not allowed." },
    {
      ...headers,
      allow: "GET, POST, OPTIONS",
    },
  );
}
