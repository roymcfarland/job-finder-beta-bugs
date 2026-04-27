import test from "node:test";
import assert from "node:assert/strict";

import {
  buildApiHeaders,
  getClientIp,
  getMimeType,
  getSecurityHeaders,
  isJsonContentType,
  parseCookies,
} from "../src/http.js";

test("parseCookies ignores malformed percent-encoded cookie values", () => {
  const cookies = parseCookies("valid=ok; broken=%E0%A4%A; another=value");

  assert.deepEqual(cookies, {
    valid: "ok",
    another: "value",
  });
});

test("getMimeType returns image content types for share assets", () => {
  assert.equal(getMimeType("public/og-image.png"), "image/png");
  assert.equal(getMimeType("public/favicon.ico"), "image/x-icon");
  assert.equal(getMimeType("public/share.webp"), "image/webp");
});

test("getClientIp ignores forwarded headers when proxy is not trusted", () => {
  const headers = {
    "x-forwarded-for": "1.2.3.4",
    "x-real-ip": "5.6.7.8",
  };

  assert.equal(getClientIp(headers, "127.0.0.1"), "127.0.0.1");
});

test("getClientIp honors forwarded headers when proxy is trusted", () => {
  const headers = {
    "x-forwarded-for": "9.9.9.9, 1.2.3.4",
  };

  assert.equal(
    getClientIp(headers, "127.0.0.1", { trustProxy: true }),
    "9.9.9.9",
  );
});

test("isJsonContentType accepts standard and structured-suffix variants", () => {
  assert.equal(isJsonContentType("application/json"), true);
  assert.equal(isJsonContentType("application/json; charset=utf-8"), true);
  assert.equal(isJsonContentType("application/vnd.example+json"), true);
  assert.equal(isJsonContentType("text/plain"), false);
  assert.equal(isJsonContentType("application/x-www-form-urlencoded"), false);
  assert.equal(isJsonContentType(undefined), false);
});

test("getSecurityHeaders adds Strict-Transport-Security in production", () => {
  const prod = getSecurityHeaders({ environment: "production" });
  const dev = getSecurityHeaders({ environment: "development" });

  assert.match(prod["strict-transport-security"], /max-age=\d+/);
  assert.equal(dev["strict-transport-security"], undefined);
  assert.match(prod["content-security-policy"], /object-src 'none'/);
});

test("buildApiHeaders only emits CORS headers when the origin matches", () => {
  const allowed = buildApiHeaders("https://app.example", "https://app.example");
  const blocked = buildApiHeaders("https://app.example", "https://evil.example");

  assert.equal(allowed["access-control-allow-origin"], "https://app.example");
  assert.equal(allowed.vary, "Origin");
  assert.equal(blocked["access-control-allow-origin"], undefined);
});
