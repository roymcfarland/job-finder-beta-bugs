import test from "node:test";
import assert from "node:assert/strict";

import { getConfig } from "../src/config.js";
import { createCronApi } from "../src/cronApi.js";

function createSilentLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

function createCleanupTasks(state = {}) {
  const calls = { sessions: 0, tokens: 0 };
  const tasks = {
    async cleanupExpiredSessions() {
      calls.sessions += 1;
      return { deleted: state.sessions ?? 0 };
    },
    async cleanupUsedResetTokens() {
      calls.tokens += 1;
      return { deleted: state.tokens ?? 0 };
    },
  };
  return { tasks, calls };
}

function buildRequest(overrides = {}) {
  return {
    pathname: "/api/cron/cleanup",
    method: "GET",
    authorization: undefined,
    ...overrides,
  };
}

test("GET /api/cron/cleanup returns 503 when CRON_SECRET is not configured", async () => {
  const { tasks, calls } = createCleanupTasks();
  const api = createCronApi({
    config: { ...getConfig({ NODE_ENV: "test" }), cronSecret: "" },
    logger: createSilentLogger(),
    tasks,
  });

  const response = await api.handle(buildRequest({ authorization: "Bearer anything" }));

  assert.equal(response.status, 503);
  assert.equal(calls.sessions, 0);
  assert.equal(calls.tokens, 0);
});

test("GET /api/cron/cleanup rejects requests without an Authorization header", async () => {
  const { tasks, calls } = createCleanupTasks();
  const api = createCronApi({
    config: { ...getConfig({ NODE_ENV: "test" }), cronSecret: "topsecret" },
    logger: createSilentLogger(),
    tasks,
  });

  const response = await api.handle(buildRequest());

  assert.equal(response.status, 401);
  assert.equal(calls.sessions, 0);
  assert.equal(calls.tokens, 0);
});

test("GET /api/cron/cleanup rejects requests with the wrong bearer token", async () => {
  const { tasks } = createCleanupTasks();
  const api = createCronApi({
    config: { ...getConfig({ NODE_ENV: "test" }), cronSecret: "topsecret" },
    logger: createSilentLogger(),
    tasks,
  });

  const response = await api.handle(
    buildRequest({ authorization: "Bearer not-the-secret" }),
  );

  assert.equal(response.status, 401);
});

test("GET /api/cron/cleanup runs both cleanup tasks and reports counts on success", async () => {
  const { tasks, calls } = createCleanupTasks({ sessions: 4, tokens: 2 });
  const api = createCronApi({
    config: { ...getConfig({ NODE_ENV: "test" }), cronSecret: "topsecret" },
    logger: createSilentLogger(),
    tasks,
  });

  const response = await api.handle(
    buildRequest({ authorization: "Bearer topsecret" }),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.sessions, 1);
  assert.equal(calls.tokens, 1);
  const payload = JSON.parse(response.body);
  assert.deepEqual(payload, { ok: true, sessions: 4, resetTokens: 2 });
});

test("GET /api/cron/cleanup also accepts a lowercase 'bearer' prefix", async () => {
  const { tasks } = createCleanupTasks();
  const api = createCronApi({
    config: { ...getConfig({ NODE_ENV: "test" }), cronSecret: "topsecret" },
    logger: createSilentLogger(),
    tasks,
  });

  const response = await api.handle(
    buildRequest({ authorization: "bearer topsecret" }),
  );

  assert.equal(response.status, 200);
});

test("DELETE /api/cron/cleanup is rejected as method-not-allowed", async () => {
  const { tasks, calls } = createCleanupTasks();
  const api = createCronApi({
    config: { ...getConfig({ NODE_ENV: "test" }), cronSecret: "topsecret" },
    logger: createSilentLogger(),
    tasks,
  });

  const response = await api.handle(
    buildRequest({ method: "DELETE", authorization: "Bearer topsecret" }),
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, "GET, POST");
  assert.equal(calls.sessions, 0);
  assert.equal(calls.tokens, 0);
});

test("GET /api/cron/unknown returns 404 even with a valid secret", async () => {
  const { tasks, calls } = createCleanupTasks();
  const api = createCronApi({
    config: { ...getConfig({ NODE_ENV: "test" }), cronSecret: "topsecret" },
    logger: createSilentLogger(),
    tasks,
  });

  const response = await api.handle(
    buildRequest({
      pathname: "/api/cron/unknown",
      authorization: "Bearer topsecret",
    }),
  );

  assert.equal(response.status, 404);
  assert.equal(calls.sessions, 0);
  assert.equal(calls.tokens, 0);
});

test("GET /api/cron/cleanup surfaces task failures as a 500", async () => {
  const tasks = {
    async cleanupExpiredSessions() {
      throw new Error("db down");
    },
    async cleanupUsedResetTokens() {
      return { deleted: 0 };
    },
  };
  const api = createCronApi({
    config: { ...getConfig({ NODE_ENV: "test" }), cronSecret: "topsecret" },
    logger: createSilentLogger(),
    tasks,
  });

  const response = await api.handle(
    buildRequest({ authorization: "Bearer topsecret" }),
  );

  assert.equal(response.status, 500);
});
