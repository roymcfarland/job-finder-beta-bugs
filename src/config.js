const DEFAULT_REPORT_LIMIT_MAX = 5;
const DEFAULT_REPORT_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_AUTH_LIMIT_MAX = 12;
const DEFAULT_AUTH_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_ADMIN_LIMIT_MAX = 240;
const DEFAULT_ADMIN_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const DEFAULT_PASSWORD_MIN_LENGTH = 10;
const DEFAULT_APP_NAME = "Beta Bug Reporter";

export function getConfig(env = process.env) {
  const environment = env.NODE_ENV?.trim() || "development";

  return {
    environment,
    appName: env.APP_NAME?.trim() || DEFAULT_APP_NAME,
    baseUrl: getBaseUrl(env),
    allowedOrigin: env.ALLOWED_ORIGIN?.trim() || "",
    adminEmails: parseEmailList(env.ADMIN_EMAILS),
    cronSecret: env.CRON_SECRET?.trim() || "",
    trustProxy: parseBoolean(env.TRUST_PROXY, isLikelyVercel(env)),
    passwordMinLength: parsePositiveInteger(
      env.PASSWORD_MIN_LENGTH,
      DEFAULT_PASSWORD_MIN_LENGTH,
    ),
    authRateLimitMax: parsePositiveInteger(
      env.AUTH_RATE_LIMIT_MAX,
      DEFAULT_AUTH_LIMIT_MAX,
    ),
    authRateLimitWindowMs: parsePositiveInteger(
      env.AUTH_RATE_LIMIT_WINDOW_MS,
      DEFAULT_AUTH_LIMIT_WINDOW_MS,
    ),
    reportRateLimitMax: parsePositiveInteger(
      env.RATE_LIMIT_MAX,
      DEFAULT_REPORT_LIMIT_MAX,
    ),
    reportRateLimitWindowMs: parsePositiveInteger(
      env.RATE_LIMIT_WINDOW_MS,
      DEFAULT_REPORT_LIMIT_WINDOW_MS,
    ),
    adminRateLimitMax: parsePositiveInteger(
      env.ADMIN_RATE_LIMIT_MAX,
      DEFAULT_ADMIN_LIMIT_MAX,
    ),
    adminRateLimitWindowMs: parsePositiveInteger(
      env.ADMIN_RATE_LIMIT_WINDOW_MS,
      DEFAULT_ADMIN_LIMIT_WINDOW_MS,
    ),
    session: (() => {
      const secureCookie =
        environment === "production" &&
        (env.SESSION_COOKIE_SECURE?.trim() ?? "true") !== "false";

      // The `__Host-` prefix tells browsers to enforce Secure + Path=/ + no
      // Domain, which gives strong CSRF/cookie-injection protection. We can
      // only use it when Secure is set, so fall back to a plain name in dev.
      const defaultCookieName = secureCookie
        ? "__Host-bug_reporter_session"
        : "bug_reporter_session";

      return {
        cookieName: env.SESSION_COOKIE_NAME?.trim() || defaultCookieName,
        ttlMs: parsePositiveInteger(env.SESSION_TTL_MS, DEFAULT_SESSION_TTL_MS),
        secureCookie,
      };
    })(),
    passwordReset: {
      ttlMs: parsePositiveInteger(
        env.PASSWORD_RESET_TTL_MS,
        DEFAULT_RESET_TOKEN_TTL_MS,
      ),
    },
    database: {
      url:
        firstNonEmpty(
          env.DATABASE_URL,
          env.POSTGRES_URL,
          env.POSTGRES_PRISMA_URL,
          env.POSTGRES_URL_NON_POOLING,
        ) || "",
      // Hosted Postgres providers (Vercel/Neon/Supabase) often use pooled
      // connection certs that fail strict verification, so we default to
      // permissive TLS. Set DATABASE_SSL_REJECT_UNAUTHORIZED=true once you've
      // pinned a CA bundle to enforce verification.
      sslRejectUnauthorized: parseBoolean(
        env.DATABASE_SSL_REJECT_UNAUTHORIZED,
        false,
      ),
      sslCa: env.DATABASE_SSL_CA?.trim() || "",
    },
    email: {
      resendApiKey: env.RESEND_API_KEY?.trim() || "",
      fromEmail:
        firstNonEmpty(
          env.AUTH_FROM_EMAIL,
          env.EMAIL_FROM,
          env.BUG_REPORT_FROM_EMAIL,
        ) || "",
      bugReportNotificationToEmail:
        firstNonEmpty(
          env.BUG_REPORT_NOTIFICATION_TO_EMAIL,
          env.BUG_REPORT_TO_EMAIL,
        ) || "",
      reportWebhookUrl: env.REPORT_WEBHOOK_URL?.trim() || "",
      reportWebhookToken: env.REPORT_WEBHOOK_TOKEN?.trim() || "",
    },
  };
}

function getBaseUrl(env) {
  const explicit = env.APP_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const publicUrl =
    env.PUBLIC_VERCEL_URL?.trim() ||
    env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    env.VERCEL_URL?.trim();

  if (publicUrl) {
    return `https://${publicUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  const host = env.HOST?.trim() || "127.0.0.1";
  const port = env.PORT?.trim() || "3000";
  return `http://${host}:${port}`;
}

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function parseEmailList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function isLikelyVercel(env) {
  return Boolean(
    env.VERCEL ||
      env.VERCEL_URL ||
      env.VERCEL_ENV ||
      env.VERCEL_PROJECT_PRODUCTION_URL,
  );
}
