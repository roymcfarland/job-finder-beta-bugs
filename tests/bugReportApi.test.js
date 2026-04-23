import test from "node:test";
import assert from "node:assert/strict";

import { createBugReportApi } from "../src/bugReportApi.js";
import { getConfig } from "../src/config.js";

function buildPayload(overrides = {}) {
  return JSON.stringify({
    email: "beta@example.com",
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

test("POST /api/report returns success for a valid report", async () => {
  const sentReports = [];
  const api = createBugReportApi({
    config: getConfig({
      NODE_ENV: "test",
      RATE_LIMIT_MAX: "2",
      RATE_LIMIT_WINDOW_MS: "1000",
    }),
    delivery: {
      async send(report) {
        sentReports.push(report);
        return { mode: "test" };
      },
    },
  });

  const result = await api.handle({
    method: "POST",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    rawBody: buildPayload(),
  });

  assert.equal(result.status, 201);
  assert.equal(sentReports.length, 1);

  const body = JSON.parse(result.body);
  assert.equal(body.deliveryMode, "test");
});

test("POST /api/report returns field errors for invalid payloads", async () => {
  const api = createBugReportApi({
    config: getConfig({ NODE_ENV: "test" }),
    delivery: {
      async send() {
        return { mode: "test" };
      },
    },
  });

  const result = await api.handle({
    method: "POST",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    rawBody: buildPayload({ summary: "" }),
  });

  assert.equal(result.status, 400);
  const body = JSON.parse(result.body);
  assert.equal(body.fieldErrors.summary, "Add a short summary so I know what broke.");
});

test("POST /api/report rate limits repeated submissions", async () => {
  let currentTime = Date.now();
  const api = createBugReportApi({
    now: () => currentTime,
    config: getConfig({
      NODE_ENV: "test",
      RATE_LIMIT_MAX: "1",
      RATE_LIMIT_WINDOW_MS: "60000",
    }),
    delivery: {
      async send() {
        return { mode: "test" };
      },
    },
  });

  const request = {
    method: "POST",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    rawBody: buildPayload({ startedAt: currentTime - 5000 }),
  };

  const firstResult = await api.handle(request);
  assert.equal(firstResult.status, 201);

  currentTime += 1000;
  const secondResult = await api.handle({
    ...request,
    rawBody: buildPayload({ startedAt: currentTime - 5000 }),
  });

  assert.equal(secondResult.status, 429);
});
