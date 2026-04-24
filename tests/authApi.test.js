import test from "node:test";
import assert from "node:assert/strict";

import { createAuthApi } from "../src/authApi.js";
import { AccountDisabledError, AuthConfigurationError } from "../src/authService.js";
import { getConfig } from "../src/config.js";

function createAllowedRateLimiter() {
  return {
    consume() {
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

test("POST /api/auth/register creates a session cookie on success", async () => {
  const api = createAuthApi({
    config: getConfig({ NODE_ENV: "test", APP_BASE_URL: "http://localhost:3000" }),
    rateLimiter: createAllowedRateLimiter(),
    authService: {
      validateRegistrationInput() {
        return {};
      },
      validateLoginInput() {
        return {};
      },
      validateResetInput() {
        return { password: "" };
      },
      normalizeEmail(value) {
        return String(value).toLowerCase();
      },
      async register() {
        return {
          user: { id: "user_1", email: "beta@example.com" },
          sessionToken: "session_token",
          expiresAt: new Date("2026-04-25T00:00:00.000Z"),
        };
      },
      async getSessionFromCookie() {
        return null;
      },
      async logout() {},
      async requestPasswordReset() {},
      async resetPassword() {},
    },
  });

  const result = await api.handle({
    pathname: "/api/auth/register",
    method: "POST",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    cookieHeader: "",
    rawBody: JSON.stringify({
      email: "beta@example.com",
      password: "long-enough-password",
    }),
  });

  assert.equal(result.status, 201);
  assert.match(result.headers["set-cookie"], /jobfinder_session=session_token/);

  const body = JSON.parse(result.body);
  assert.equal(body.user.email, "beta@example.com");
});

test("POST /api/auth/login returns field errors when input is invalid", async () => {
  const api = createAuthApi({
    config: getConfig({ NODE_ENV: "test" }),
    rateLimiter: createAllowedRateLimiter(),
    authService: {
      validateRegistrationInput() {
        return {};
      },
      validateLoginInput() {
        return {
          email: "Enter a valid email address.",
          password: "Enter your password.",
        };
      },
      validateResetInput() {
        return { password: "" };
      },
      normalizeEmail(value) {
        return String(value).toLowerCase();
      },
      async register() {
        return null;
      },
      async login() {
        return null;
      },
      async getSessionFromCookie() {
        return null;
      },
      async logout() {},
      async requestPasswordReset() {},
      async resetPassword() {},
    },
  });

  const result = await api.handle({
    pathname: "/api/auth/login",
    method: "POST",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    cookieHeader: "",
    rawBody: JSON.stringify({
      email: "",
      password: "",
    }),
  });

  assert.equal(result.status, 400);
  const body = JSON.parse(result.body);
  assert.equal(body.fieldErrors.email, "Enter a valid email address.");
  assert.equal(body.fieldErrors.password, "Enter your password.");
});

test("GET /api/auth/session returns unauthorized when no session exists", async () => {
  const api = createAuthApi({
    config: getConfig({ NODE_ENV: "test" }),
    rateLimiter: createAllowedRateLimiter(),
    authService: {
      validateRegistrationInput() {
        return {};
      },
      validateLoginInput() {
        return {};
      },
      validateResetInput() {
        return { password: "" };
      },
      normalizeEmail(value) {
        return String(value).toLowerCase();
      },
      async register() {
        return null;
      },
      async login() {
        return null;
      },
      async getSessionFromCookie() {
        return null;
      },
      async logout() {},
      async requestPasswordReset() {},
      async resetPassword() {},
    },
  });

  const result = await api.handle({
    pathname: "/api/auth/session",
    method: "GET",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    cookieHeader: "",
    rawBody: "",
  });

  assert.equal(result.status, 401);
});

test("GET /api/auth/session returns configuration errors cleanly", async () => {
  const api = createAuthApi({
    config: getConfig({ NODE_ENV: "test" }),
    rateLimiter: createAllowedRateLimiter(),
    authService: {
      validateRegistrationInput() {
        return {};
      },
      validateLoginInput() {
        return {};
      },
      validateResetInput() {
        return { password: "" };
      },
      normalizeEmail(value) {
        return String(value).toLowerCase();
      },
      async register() {
        return null;
      },
      async login() {
        return null;
      },
      async getSessionFromCookie() {
        throw new AuthConfigurationError("Postgres is not configured.");
      },
      async logout() {},
      async requestPasswordReset() {},
      async resetPassword() {},
    },
  });

  const result = await api.handle({
    pathname: "/api/auth/session",
    method: "GET",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    cookieHeader: "",
    rawBody: "",
  });

  assert.equal(result.status, 503);
  assert.equal(JSON.parse(result.body).error, "Postgres is not configured.");
});

test("POST /api/auth/login returns a disabled-account error cleanly", async () => {
  const api = createAuthApi({
    config: getConfig({ NODE_ENV: "test" }),
    rateLimiter: createAllowedRateLimiter(),
    authService: {
      validateRegistrationInput() {
        return {};
      },
      validateLoginInput() {
        return {};
      },
      validateResetInput() {
        return { password: "" };
      },
      normalizeEmail(value) {
        return String(value).toLowerCase();
      },
      async register() {
        return null;
      },
      async login() {
        throw new AccountDisabledError();
      },
      async getSessionFromCookie() {
        return null;
      },
      async logout() {},
      async requestPasswordReset() {},
      async resetPassword() {},
    },
  });

  const result = await api.handle({
    pathname: "/api/auth/login",
    method: "POST",
    origin: undefined,
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    cookieHeader: "",
    rawBody: JSON.stringify({
      email: "beta@example.com",
      password: "password12345",
    }),
  });

  assert.equal(result.status, 403);
  const body = JSON.parse(result.body);
  assert.match(body.error, /disabled/i);
});
