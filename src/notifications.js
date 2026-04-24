export class EmailDeliveryUnavailableError extends Error {
  constructor(message = "Email delivery is not configured.") {
    super(message);
    this.name = "EmailDeliveryUnavailableError";
  }
}

export function createNotificationService(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const logger = options.logger ?? console;

  return {
    async sendPasswordResetEmail({ email, resetUrl }) {
      if (!config.email.fromEmail || !config.email.resendApiKey) {
        if (config.environment === "production") {
          throw new EmailDeliveryUnavailableError(
            "Password reset email is not configured for production.",
          );
        }

        logInfo(logger, "Password reset link generated for local delivery.", {
          email,
          resetUrl,
        });
        return { mode: "console" };
      }

      await sendWithResend(
        fetchImpl,
        config.email.resendApiKey,
        buildPasswordResetEmail({
          from: config.email.fromEmail,
          to: email,
          resetUrl,
        }),
      );

      return { mode: "resend" };
    },

    async sendBugReportNotification({ report, reporterEmail }) {
      if (config.email.reportWebhookUrl) {
        await sendWebhookNotification(fetchImpl, config.email, {
          reporterEmail,
          report,
        });
        return { mode: "webhook" };
      }

      if (
        config.email.resendApiKey &&
        config.email.fromEmail &&
        config.email.bugReportNotificationToEmail
      ) {
        await sendWithResend(
          fetchImpl,
          config.email.resendApiKey,
          buildBugReportEmail({
            from: config.email.fromEmail,
            to: config.email.bugReportNotificationToEmail,
            reporterEmail,
            report,
          }),
        );
        return { mode: "resend" };
      }

      if (config.environment !== "production") {
        logInfo(logger, "Bug report notification skipped; report stored locally.", {
          reporterEmail,
          submissionId: report.meta.submissionId,
          category: report.report.category,
          severity: report.report.severity,
          summary: report.report.summary,
        });
        return { mode: "console" };
      }

      return { mode: "disabled" };
    },
  };
}

async function sendWithResend(fetchImpl, apiKey, payload) {
  ensureFetch(fetchImpl);

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new EmailDeliveryUnavailableError(
      `Email delivery failed with status ${response.status}.`,
    );
  }
}

async function sendWebhookNotification(fetchImpl, emailConfig, payload) {
  ensureFetch(fetchImpl);

  const response = await fetchImpl(emailConfig.reportWebhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(emailConfig.reportWebhookToken
        ? { authorization: `Bearer ${emailConfig.reportWebhookToken}` }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new EmailDeliveryUnavailableError(
      `Bug report webhook failed with status ${response.status}.`,
    );
  }
}

function buildPasswordResetEmail({ from, to, resetUrl }) {
  return {
    from,
    to: [to],
    subject: "Reset your JobFinder.guru beta password",
    text: [
      "We received a request to reset your password.",
      "",
      `Reset it here: ${resetUrl}`,
      "",
      "If you didn't request this, you can safely ignore this email.",
    ].join("\n"),
  };
}

function buildBugReportEmail({ from, to, reporterEmail, report }) {
  const lines = [
    `Report ID: ${report.meta.submissionId}`,
    `Submitted: ${report.meta.submittedAt}`,
    `Reporter: ${reporterEmail}`,
    `Category: ${report.report.category}`,
    `Severity: ${report.report.severity}`,
    `Affected URL: ${report.report.affectedUrl || "Not provided"}`,
    "",
    "Summary",
    report.report.summary,
    "",
    "What happened",
    report.report.happened,
    "",
    "How to reproduce",
    report.report.reproduceSteps,
  ];

  if (report.report.expectedBehavior) {
    lines.push("", "Expected behavior", report.report.expectedBehavior);
  }

  if (report.report.extraDetails) {
    lines.push("", "Extra details", report.report.extraDetails);
  }

  return {
    from,
    to: [to],
    reply_to: reporterEmail,
    subject: `[JobFinder bug] ${report.report.summary}`,
    text: lines.join("\n"),
  };
}

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new EmailDeliveryUnavailableError("Global fetch is unavailable.");
  }
}

function logInfo(logger, message, context) {
  const log = logger.info ?? logger.log;
  if (typeof log === "function") {
    log.call(logger, message, context);
  }
}
