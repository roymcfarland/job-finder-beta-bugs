import test from "node:test";
import assert from "node:assert/strict";

import {
  ValidationError,
  buildBugReportSubmission,
} from "../src/bugReportSchema.js";

function buildValidPayload(startedAt = Date.now() - 5000) {
  return {
    name: "Taylor Beta",
    email: "taylor@example.com",
    summary: "Saved jobs page crashes",
    category: "broken-page",
    severity: "high",
    affectedUrl: "https://jobfinder.guru/saved",
    happened: "The page shows a blank screen after I click apply filters.",
    reproduceSteps: "Open saved jobs and filter by remote jobs.",
    expectedBehavior: "The list should refresh normally.",
    extraDetails: "Chrome 124 on macOS",
    startedAt,
    website: "",
    clientContext: {
      language: "en-US",
      timeZone: "America/Chicago",
      platform: "macOS",
      viewport: "1440x900",
    },
  };
}

test("buildBugReportSubmission returns a normalized report", () => {
  const now = new Date("2026-04-23T12:00:00.000Z");
  const report = buildBugReportSubmission(buildValidPayload(now.getTime() - 5000), {
    now,
    userAgent: "Mozilla/5.0",
  });

  assert.equal(report.report.summary, "Saved jobs page crashes");
  assert.equal(report.report.severity, "high");
  assert.equal(report.reporter.email, "taylor@example.com");
  assert.equal(report.meta.submittedAt, now.toISOString());
  assert.match(report.meta.submissionId, /^[0-9a-f-]{36}$/);
});

test("buildBugReportSubmission rejects missing required fields", () => {
  assert.throws(
    () =>
      buildBugReportSubmission(
        {
          ...buildValidPayload(),
          summary: "",
          reproduceSteps: "",
        },
        { now: new Date() },
      ),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.fieldErrors.summary, "Add a short summary so I know what broke.");
      assert.equal(
        error.fieldErrors.reproduceSteps,
        "Add the steps so I can reproduce the issue.",
      );
      return true;
    },
  );
});

test("buildBugReportSubmission rejects obvious bot traffic", () => {
  assert.throws(
    () =>
      buildBugReportSubmission(
        {
          ...buildValidPayload(),
          website: "https://spam.example",
        },
        { now: new Date() },
      ),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.fieldErrors.website, "Spam protection triggered.");
      return true;
    },
  );
});
