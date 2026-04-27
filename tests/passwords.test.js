import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_PASSWORD_LENGTH,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "../src/passwords.js";

test("password hashes verify correctly", async () => {
  const hashed = await hashPassword("correct horse battery staple");

  assert.notEqual(hashed, "correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hashed), true);
  assert.equal(await verifyPassword("wrong-password", hashed), false);
});

test("hashPassword rejects pathologically long inputs", async () => {
  const huge = "a".repeat(MAX_PASSWORD_LENGTH + 1);

  await assert.rejects(() => hashPassword(huge), RangeError);
});

test("verifyPassword returns false for oversized inputs without spending CPU", async () => {
  const hashed = await hashPassword("normal-length-password");
  const huge = "a".repeat(MAX_PASSWORD_LENGTH + 1);

  assert.equal(await verifyPassword(huge, hashed), false);
});

test("validatePassword reports both minimum and maximum length issues", () => {
  assert.match(validatePassword("short", 10), /at least 10/);
  assert.equal(validatePassword("a".repeat(64), 10), "");
  assert.match(
    validatePassword("a".repeat(MAX_PASSWORD_LENGTH + 1), 10),
    new RegExp(`${MAX_PASSWORD_LENGTH} characters or fewer`),
  );
});
