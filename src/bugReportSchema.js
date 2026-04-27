import crypto from "node:crypto";

export const BUG_CATEGORIES = [
  "broken-page",
  "wrong-results",
  "account",
  "performance",
  "payments",
  "other",
];

export const SEVERITY_LEVELS = ["low", "medium", "high", "blocking"];

const FIELD_LIMITS = {
  name: 80,
  email: 160,
  summary: 140,
  affectedUrl: 500,
  happened: 2000,
  reproduceSteps: 2000,
  expectedBehavior: 1200,
  extraDetails: 1500,
  website: 120,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MINIMUM_SUBMISSION_AGE_MS = 1500;
const MAXIMUM_SUBMISSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class ValidationError extends Error {
  constructor(fieldErrors) {
    super("Please review the highlighted fields and try again.");
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export function buildBugReportSubmission(payload, context = {}) {
  const fieldErrors = {};

  const name = normalizeText(payload.name, FIELD_LIMITS.name);
  // When the caller will overwrite the reporter email from the session
  // (skipReporterEmail), we ignore whatever the client sent so a stale value
  // can't trigger a 400 even though the value never gets used.
  const email = context.skipReporterEmail
    ? ""
    : normalizeText(payload.email, FIELD_LIMITS.email);
  const summary = normalizeText(payload.summary, FIELD_LIMITS.summary);
  const affectedUrl = normalizeText(payload.affectedUrl, FIELD_LIMITS.affectedUrl);
  const category = normalizeChoice(payload.category);
  const severity = normalizeChoice(payload.severity);
  const happened = normalizeText(payload.happened, FIELD_LIMITS.happened);
  const reproduceSteps = normalizeText(
    payload.reproduceSteps,
    FIELD_LIMITS.reproduceSteps,
  );
  const expectedBehavior = normalizeText(
    payload.expectedBehavior,
    FIELD_LIMITS.expectedBehavior,
  );
  const extraDetails = normalizeText(payload.extraDetails, FIELD_LIMITS.extraDetails);
  const website = normalizeText(payload.website, FIELD_LIMITS.website);
  const startedAt = Number.parseInt(String(payload.startedAt ?? ""), 10);

  if (!summary) {
    fieldErrors.summary = "Add a short summary so I know what broke.";
  }

  if (!BUG_CATEGORIES.includes(category)) {
    fieldErrors.category = "Choose the closest category.";
  }

  if (!SEVERITY_LEVELS.includes(severity)) {
    fieldErrors.severity = "Choose how disruptive this bug was.";
  }

  if (!happened) {
    fieldErrors.happened = "Describe what happened.";
  }

  if (!reproduceSteps) {
    fieldErrors.reproduceSteps = "Add the steps so I can reproduce the issue.";
  }

  if (!context.skipReporterEmail && email && !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Enter a valid email address or leave it blank.";
  }

  if (affectedUrl && !isLikelyUrl(affectedUrl)) {
    fieldErrors.affectedUrl = "Use a full URL that starts with http:// or https://.";
  }

  if (website) {
    fieldErrors.website = "Spam protection triggered.";
  }

  validateSubmissionTiming(startedAt, fieldErrors, context.now);

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError(fieldErrors);
  }

  return {
    reporter: {
      name,
      email,
    },
    report: {
      summary,
      category,
      severity,
      affectedUrl,
      happened,
      reproduceSteps,
      expectedBehavior,
      extraDetails,
    },
    client: sanitizeClientContext(payload.clientContext),
    meta: {
      submissionId: crypto.randomUUID(),
      submittedAt: (context.now ?? new Date()).toISOString(),
      source: "jobfinder-beta-bug-form",
      userAgent: normalizeText(context.userAgent, 400),
    },
  };
}

function normalizeText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function normalizeChoice(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isLikelyUrl(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function validateSubmissionTiming(startedAt, fieldErrors, now = new Date()) {
  if (!Number.isInteger(startedAt)) {
    fieldErrors.startedAt = "The form expired. Refresh and try again.";
    return;
  }

  const age = now.getTime() - startedAt;

  if (age < MINIMUM_SUBMISSION_AGE_MS || age > MAXIMUM_SUBMISSION_AGE_MS) {
    fieldErrors.startedAt = "The form expired. Refresh and try again.";
  }
}

function sanitizeClientContext(clientContext) {
  if (!clientContext || typeof clientContext !== "object" || Array.isArray(clientContext)) {
    return {};
  }

  return {
    language: normalizeText(clientContext.language, 32),
    timeZone: normalizeText(clientContext.timeZone, 64),
    platform: normalizeText(clientContext.platform, 64),
    viewport: normalizeText(clientContext.viewport, 64),
  };
}
