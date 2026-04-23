import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export function createDeliveryService(config, options = {}) {
  const { delivery } = config;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (delivery.reportWebhookUrl) {
    return {
      mode: "webhook",
      send(report) {
        return sendToWebhook(report, delivery, fetchImpl);
      },
    };
  }

  if (
    delivery.resendApiKey &&
    delivery.bugReportToEmail &&
    delivery.bugReportFromEmail
  ) {
    return {
      mode: "resend",
      send(report) {
        return sendWithResend(report, delivery, fetchImpl);
      },
    };
  }

  if (delivery.reportLogPath) {
    return {
      mode: "file",
      send(report) {
        return appendReportToFile(report, delivery.reportLogPath);
      },
    };
  }

  if (config.environment !== "production") {
    return {
      mode: "console",
      send(report) {
        console.log("Received bug report:", JSON.stringify(report, null, 2));
        return { mode: "console" };
      },
    };
  }

  return {
    mode: "disabled",
    send() {
      throw new Error(
        "Bug report delivery is not configured. Set Resend, webhook, or file delivery.",
      );
    },
  };
}

async function sendToWebhook(report, delivery, fetchImpl) {
  ensureFetch(fetchImpl);

  const response = await fetchImpl(delivery.reportWebhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(delivery.reportWebhookToken
        ? { authorization: `Bearer ${delivery.reportWebhookToken}` }
        : {}),
    },
    body: JSON.stringify(report),
  });

  if (!response.ok) {
    throw new Error(`Webhook delivery failed with status ${response.status}.`);
  }

  return { mode: "webhook" };
}

async function sendWithResend(report, delivery, fetchImpl) {
  ensureFetch(fetchImpl);

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${delivery.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: delivery.bugReportFromEmail,
      to: [delivery.bugReportToEmail],
      reply_to: report.reporter.email || undefined,
      subject: `[JobFinder bug] ${report.report.summary}`,
      text: formatReportEmail(report),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend delivery failed with status ${response.status}.`);
  }

  return { mode: "resend" };
}

async function appendReportToFile(report, reportLogPath) {
  const directory = path.dirname(reportLogPath);
  await mkdir(directory, { recursive: true });
  await appendFile(reportLogPath, `${JSON.stringify(report)}\n`, "utf8");
  return { mode: "file" };
}

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is unavailable in this runtime.");
  }
}

function formatReportEmail(report) {
  const lines = [
    `Report ID: ${report.meta.submissionId}`,
    `Submitted: ${report.meta.submittedAt}`,
    `Category: ${report.report.category}`,
    `Severity: ${report.report.severity}`,
    `Reporter name: ${report.reporter.name || "Not provided"}`,
    `Reporter email: ${report.reporter.email || "Not provided"}`,
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

  if (Object.keys(report.client).length > 0) {
    lines.push("", "Client context", JSON.stringify(report.client, null, 2));
  }

  if (report.meta.userAgent) {
    lines.push("", "User agent", report.meta.userAgent);
  }

  return lines.join("\n");
}
