import test from "node:test";
import assert from "node:assert/strict";

import { ValidationError } from "../src/bugReportSchema.js";
import { createBugReportApi } from "../src/bugReportApi.js";
import { getConfig } from "../src/config.js";

function buildPayload(overrides = {}) {
  return JSON.stringify({
    summary: "Bug in saved jobs",
    category: "broken-page",
    severity: "medium",
    affectedUrl: "https://jobfinder.guru/saved",
    happened: "The list disappears after filtering.",
    reproduceSteps: "Open saved jobs and filter by remote.",
    expectedBehavior: "The list should stay visible.",
    extraDetails: "",
    startedAt: Date.now() - 5000,
    website: "",
    clientContext: {
      language: "en-US",
      timeZone: "America/Chicago",
      platform: "macOS",
      viewport: "1440x900",
    },
    ...overrides,
  });
}

function createAllowedRateLimiter() {
  return {
    consume() {
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

test("POST /api/report requires authentication", async () => {
  const api = createBugReportApi({
    config: getConfig({ NODE_ENV: "test" }),
    rateLimiter: createAllowedRateLimiter(),
    authService: {
      async getSessionFromCookie() {
        return null;
      },
    },
    bugReportService: {
      async submit() {
        return null;
      },
      async listForUser() {
        return [];
      },
    },
  });

  const result = await api.handle({
    pathname: "/api/report",
    method: "POST",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    cookieHeader: "",
    rawBody: buildPayload(),
  });

  assert.equal(result.status, 401);
});

test("POST /api/report returns success for a valid authenticated report", async () => {
  const saved = [];
  const api = createBugReportApi({
    config: getConfig({ NODE_ENV: "test" }),
    rateLimiter: createAllowedRateLimiter(),
    authService: {
      async getSessionFromCookie() {
        return {
          user: {
            id: "user_1",
            email: "beta@example.com",
          },
        };
      },
    },
    bugReportService: {
      async submit(input) {
        saved.push(input);
        return {
          reportId: "report_1",
          notificationMode: "stored-only",
        };
      },
      async listForUser() {
        return [];
      },
    },
  });

  const result = await api.handle({
    pathname: "/api/report",
    method: "POST",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    cookieHeader: "jobfinder_session=session_token",
    rawBody: buildPayload(),
  });

  assert.equal(result.status, 201);
  assert.equal(saved.length, 1);

  const body = JSON.parse(result.body);
  assert.equal(body.reportId, "report_1");
  assert.equal(body.notificationMode, "stored-only");
});

test("POST /api/report returns field errors from validation failures", async () => {
  const api = createBugReportApi({
    config: getConfig({ NODE_ENV: "test" }),
    rateLimiter: createAllowedRateLimiter(),
    authService: {
      async getSessionFromCookie() {
        return {
          user: {
            id: "user_1",
            email: "beta@example.com",
          },
        };
      },
    },
    bugReportService: {
      async submit() {
        throw new ValidationError({
          summary: "Add a short summary so I know what broke.",
        });
      },
      async listForUser() {
        return [];
      },
    },
  });

  const result = await api.handle({
    pathname: "/api/report",
    method: "POST",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    cookieHeader: "jobfinder_session=session_token",
    rawBody: buildPayload(),
  });

  assert.equal(result.status, 400);
  const body = JSON.parse(result.body);
  assert.equal(body.fieldErrors.summary, "Add a short summary so I know what broke.");
});

test("GET /api/reports returns recent reports for the signed-in user", async () => {
  const api = createBugReportApi({
    config: getConfig({ NODE_ENV: "test" }),
    rateLimiter: createAllowedRateLimiter(),
    authService: {
      async getSessionFromCookie() {
        return {
          user: {
            id: "user_1",
            email: "beta@example.com",
          },
        };
      },
    },
    bugReportService: {
      async submit() {
        return null;
      },
      async listForUser() {
        return [
          {
            id: "report_1",
            summary: "Bug in saved jobs",
            category: "broken-page",
            severity: "medium",
            createdAt: "2026-04-23T12:00:00.000Z",
          },
        ];
      },
    },
  });

  const result = await api.handle({
    pathname: "/api/reports",
    method: "GET",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    cookieHeader: "jobfinder_session=session_token",
    rawBody: "",
  });

  assert.equal(result.status, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.reports.length, 1);
  assert.equal(body.reports[0].id, "report_1");
});
