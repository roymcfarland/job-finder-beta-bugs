const DEFAULT_RATE_LIMIT_MAX = 5;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export function getConfig(env = process.env) {
  return {
    environment: env.NODE_ENV?.trim() || "development",
    allowedOrigin: env.ALLOWED_ORIGIN?.trim() || "",
    rateLimitMax: parsePositiveInteger(env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
    rateLimitWindowMs: parsePositiveInteger(
      env.RATE_LIMIT_WINDOW_MS,
      DEFAULT_RATE_LIMIT_WINDOW_MS,
    ),
    delivery: {
      resendApiKey: env.RESEND_API_KEY?.trim() || "",
      bugReportToEmail: env.BUG_REPORT_TO_EMAIL?.trim() || "",
      bugReportFromEmail: env.BUG_REPORT_FROM_EMAIL?.trim() || "",
      reportWebhookUrl: env.REPORT_WEBHOOK_URL?.trim() || "",
      reportWebhookToken: env.REPORT_WEBHOOK_TOKEN?.trim() || "",
      reportLogPath: env.REPORT_LOG_PATH?.trim() || "",
    },
  };
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
