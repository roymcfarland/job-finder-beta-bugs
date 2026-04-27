import crypto from "node:crypto";

import { cleanupExpiredSessions, cleanupUsedResetTokens } from "./db.js";
import { jsonResponse, methodNotAllowedResponse } from "./http.js";
import { getErrorContext } from "./logger.js";

// Vercel Cron invokes scheduled paths via GET. When CRON_SECRET is set on the
// project, Vercel automatically attaches `Authorization: Bearer ${CRON_SECRET}`
// to each scheduled request, which is what we verify here. The endpoint is
// also reachable with a manual curl using the same header for ad-hoc runs.
export function createCronApi(options = {}) {
  const { config, logger = console } = options;

  const tasks = options.tasks ?? {
    cleanupExpiredSessions: () => cleanupExpiredSessions(config),
    cleanupUsedResetTokens: () => cleanupUsedResetTokens(config),
  };

  return {
    async handle(request) {
      const headers = { "cache-control": "no-store" };

      if (request.method !== "GET" && request.method !== "POST") {
        return methodNotAllowedResponse(headers, "GET, POST");
      }

      // Refuse to run unauthenticated. An unset secret in production almost
      // always means a misconfigured deploy; a 503 is louder than silently
      // exposing the endpoint.
      if (!config.cronSecret) {
        logger.error?.(
          "Cron endpoint hit but CRON_SECRET is not configured.",
          { pathname: request.pathname },
        );
        return jsonResponse(
          503,
          { error: "Cron endpoint is not configured." },
          headers,
        );
      }

      if (!isAuthorized(request.authorization, config.cronSecret)) {
        return jsonResponse(401, { error: "Unauthorized." }, headers);
      }

      if (request.pathname === "/api/cron/cleanup") {
        try {
          const sessions = await tasks.cleanupExpiredSessions();
          const tokens = await tasks.cleanupUsedResetTokens();

          logger.info?.("Cron cleanup completed.", {
            sessions: sessions.deleted ?? 0,
            resetTokens: tokens.deleted ?? 0,
          });

          return jsonResponse(
            200,
            {
              ok: true,
              sessions: sessions.deleted ?? 0,
              resetTokens: tokens.deleted ?? 0,
            },
            headers,
          );
        } catch (error) {
          logger.error?.("Cron cleanup failed.", getErrorContext(error));
          return jsonResponse(
            500,
            { error: "Cleanup failed." },
            headers,
          );
        }
      }

      return jsonResponse(404, { error: "Not found." }, headers);
    },
  };
}

function isAuthorized(authorizationHeader, secret) {
  if (typeof authorizationHeader !== "string" || !secret) {
    return false;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) {
    return false;
  }

  const provided = match[1].trim();
  if (!provided) {
    return false;
  }

  const providedBytes = Buffer.from(provided, "utf8");
  const secretBytes = Buffer.from(secret, "utf8");

  // timingSafeEqual throws on length mismatch; a length-difference reveal is
  // acceptable here because the secret length is fixed per deployment.
  if (providedBytes.length !== secretBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBytes, secretBytes);
}
