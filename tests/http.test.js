import test from "node:test";
import assert from "node:assert/strict";

import { getMimeType, parseCookies } from "../src/http.js";

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
