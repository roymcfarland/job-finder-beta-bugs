import test from "node:test";
import assert from "node:assert/strict";

import { parseCookies } from "../src/http.js";

test("parseCookies ignores malformed percent-encoded cookie values", () => {
  const cookies = parseCookies("valid=ok; broken=%E0%A4%A; another=value");

  assert.deepEqual(cookies, {
    valid: "ok",
    another: "value",
  });
});
