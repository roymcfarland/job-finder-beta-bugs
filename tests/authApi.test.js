import test from "node:test";
import assert from "node:assert/strict";

import { createAuthApi } from "../src/authApi.js";
import {
  AccountDisabledError,
  AuthConfigurationError,
  DuplicateEmailError,
  InvalidCredentialsError,
  normalizeEmail,
} from "../src/authService.js";
import { getConfig } from "../src/config.js";

function createAllowedRateLimiter() {
  return {
    consume() {
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

function createBlockingRateLimiter() {
  return {
    consume() {
      return { allowed: false, retryAfterSeconds: 60 };
    },
  };
}

function createRegistrationFixture({ env = {}, fieldErrors = {}, registerError } = {}) {
  const registerCalls = [];
  const api = createAuthApi({
    config: getConfig({ NODE_ENV: "test", REGISTRATION_INVITE_CODE: "test-invite-code", ...env }),
    rateLimiter: createAllowedRateLimiter(),
    authService: {
      normalizeEmail,
      validateRegistrationInput() {
        return fieldErrors;
      },
      async register(input) {
        registerCalls.push(input);
        if (registerError) {
          throw registerError;
        }
        return {
          user: { id: "user_1", email: input.email },
          sessionToken: "session_token",
          expiresAt: new Date("2026-04-25T00:00:00.000Z"),
        };
      },
    },
  });

  return {
    registerCalls,
    register(payload = {}) {
      return api.handle({
        pathname: "/api/auth/register",
        method: "POST",
        ip: "127.0.0.1",
        userAgent: "Mozilla/5.0",
        contentType: "application/json",
        rawBody: JSON.stringify({
          email: "beta@example.com",
          password: "long-enough-password",
          ...payload,
        }),
      });
    },
  };
}

test("POST /api/auth/register accepts the correct invite code", async () => {
  const fixture = createRegistrationFixture();
  const result = await fixture.register({ inviteCode: "test-invite-code" });

  assert.equal(result.status, 201);
  assert.equal(fixture.registerCalls.length, 1);
  assert.equal(fixture.registerCalls[0].email, "beta@example.com");
  assert.match(result.headers["set-cookie"], /bug_reporter_session=session_token/);
});

test("POST /api/auth/register trims the supplied invite code", async () => {
  const fixture = createRegistrationFixture();
  const result = await fixture.register({ inviteCode: "  test-invite-code  " });

  assert.equal(result.status, 201);
  assert.equal(fixture.registerCalls.length, 1);
});

for (const [name, inviteCode] of [
  ["missing code", undefined],
  ["wrong code", "fake-invite-code"],
  ["different-length code", "short"],
  ["non-string code", 12345],
  ["blank code", "   "],
]) {
  test(`POST /api/auth/register rejects ${name} without calling register`, async () => {
    const fixture = createRegistrationFixture();
    const result = await fixture.register({ inviteCode });

    assert.equal(fixture.registerCalls.length, 0, "rejected attempts must not call register");
    assert.equal(result.status, 403);
    assert.deepEqual(JSON.parse(result.body), {
      error: "A valid invite code is required to create an account.",
      fieldErrors: { inviteCode: "That invite code isn't valid." },
    });
    assert.equal(result.headers["set-cookie"], undefined);
  });
}

test("POST /api/auth/register lets a normalized admin email bypass the invite code", async () => {
  const fixture = createRegistrationFixture({
    env: { NODE_ENV: "production", ADMIN_EMAILS: "Admin@Example.com" },
  });
  const result = await fixture.register({ email: "  ADMIN@example.com  " });

  assert.equal(result.status, 201);
  assert.equal(fixture.registerCalls.length, 1);
});

test("POST /api/auth/register closes production registration with no code configured", async () => {
  const fixture = createRegistrationFixture({
    env: { NODE_ENV: "production", REGISTRATION_INVITE_CODE: "  " },
  });
  const result = await fixture.register({ inviteCode: "any-code" });

  assert.equal(fixture.registerCalls.length, 0, "closed registration must not call register");
  assert.equal(result.status, 403);
  assert.deepEqual(JSON.parse(result.body), { error: "Registration is currently closed." });
  assert.equal(result.headers["set-cookie"], undefined);
});

test("POST /api/auth/register lets an admin bootstrap when production registration is closed", async () => {
  const fixture = createRegistrationFixture({
    env: { NODE_ENV: "production", REGISTRATION_INVITE_CODE: "", ADMIN_EMAILS: "admin@example.com" },
  });
  const result = await fixture.register({ email: "admin@example.com" });

  assert.equal(result.status, 201);
  assert.equal(fixture.registerCalls.length, 1);
});

test("POST /api/auth/register stays open outside production with no code configured", async () => {
  const fixture = createRegistrationFixture({
    env: { NODE_ENV: "development", REGISTRATION_INVITE_CODE: "" },
  });
  const result = await fixture.register();

  assert.equal(result.status, 201);
  assert.equal(fixture.registerCalls.length, 1);
});

test("POST /api/auth/register validates fields before checking the invite code", async () => {
  const fixture = createRegistrationFixture({ fieldErrors: { email: "Enter a valid email address." } });
  const result = await fixture.register({ email: "invalid" });

  assert.equal(fixture.registerCalls.length, 0);
  assert.equal(result.status, 400);
  assert.deepEqual(JSON.parse(result.body).fieldErrors, { email: "Enter a valid email address." });
});

test("POST /api/auth/register does not expose an existing account when the invite is missing", async () => {
  const fixture = createRegistrationFixture({ registerError: new DuplicateEmailError() });
  const result = await fixture.register();

  assert.equal(fixture.registerCalls.length, 0);
  assert.equal(result.status, 403);
  assert.deepEqual(JSON.parse(result.body), {
    error: "A valid invite code is required to create an account.",
    fieldErrors: { inviteCode: "That invite code isn't valid." },
  });
});

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
    contentType: "application/json",
    cookieHeader: "",
    rawBody: JSON.stringify({
      email: "beta@example.com",
      password: "long-enough-password",
    }),
  });

  assert.equal(result.status, 201);
  assert.match(result.headers["set-cookie"], /bug_reporter_session=session_token/);

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
    contentType: "application/json",
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
    contentType: "application/json",
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

test("POST /api/auth/login throttles repeated failures for the same account", async () => {
  let loginCalls = 0;
  const api = createAuthApi({
    config: getConfig({ NODE_ENV: "test" }),
    rateLimiter: createAllowedRateLimiter(),
    accountRateLimiter: createBlockingRateLimiter(),
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
        loginCalls += 1;
        throw new InvalidCredentialsError();
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
    contentType: "application/json",
    cookieHeader: "",
    rawBody: JSON.stringify({
      email: "beta@example.com",
      password: "password12345",
    }),
  });

  assert.equal(result.status, 429);
  assert.equal(loginCalls, 0);
  assert.equal(result.headers["retry-after"], "60");
});

test("POST /api/auth/logout rejects requests from an unrecognized origin", async () => {
  let logoutCalls = 0;
  const api = createAuthApi({
    config: getConfig({
      NODE_ENV: "test",
      APP_BASE_URL: "https://bugs.example.com",
    }),
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
        return { token: "session_token", user: { id: "user_1", email: "beta@example.com" } };
      },
      async logout() {
        logoutCalls += 1;
      },
      async requestPasswordReset() {},
      async resetPassword() {},
    },
  });

  const result = await api.handle({
    pathname: "/api/auth/logout",
    method: "POST",
    origin: "https://attacker.example",
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    contentType: "application/json",
    cookieHeader: "bug_reporter_session=session_token",
    rawBody: "",
  });

  assert.equal(result.status, 403);
  assert.equal(logoutCalls, 0);
});

test("POST /api/auth/logout accepts requests with a matching origin", async () => {
  let logoutCalls = 0;
  const api = createAuthApi({
    config: getConfig({
      NODE_ENV: "test",
      APP_BASE_URL: "https://bugs.example.com",
    }),
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
        return { token: "session_token", user: { id: "user_1", email: "beta@example.com" } };
      },
      async logout() {
        logoutCalls += 1;
      },
      async requestPasswordReset() {},
      async resetPassword() {},
    },
  });

  const result = await api.handle({
    pathname: "/api/auth/logout",
    method: "POST",
    origin: "https://bugs.example.com",
    ip: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    contentType: "application/json",
    cookieHeader: "bug_reporter_session=session_token",
    rawBody: "",
  });

  assert.equal(result.status, 204);
  assert.equal(logoutCalls, 1);
});

test("POST /api/auth/login rejects non-JSON content types", async () => {
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
        throw new Error("Should not be invoked when content-type is wrong.");
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
    contentType: "text/plain",
    cookieHeader: "",
    rawBody: "email=foo&password=bar",
  });

  assert.equal(result.status, 415);
});
