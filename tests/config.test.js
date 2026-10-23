import test from "node:test";
import assert from "node:assert/strict";

import { getConfig } from "../src/config.js";

test("registration invite code defaults to empty when unset or blank", () => {
  assert.equal(getConfig({}).registrationInviteCode, "");
  assert.equal(getConfig({ REGISTRATION_INVITE_CODE: "   " }).registrationInviteCode, "");
});

test("registration invite code trims surrounding whitespace", () => {
  assert.equal(
    getConfig({ REGISTRATION_INVITE_CODE: "  test-invite-code  " }).registrationInviteCode,
    "test-invite-code",
  );
});
