import test from "node:test";
import assert from "node:assert/strict";

import { hashPassword, verifyPassword } from "../src/passwords.js";

test("password hashes verify correctly", async () => {
  const hashed = await hashPassword("correct horse battery staple");

  assert.notEqual(hashed, "correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hashed), true);
  assert.equal(await verifyPassword("wrong-password", hashed), false);
});
