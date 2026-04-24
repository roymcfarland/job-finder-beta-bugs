import test from "node:test";
import assert from "node:assert/strict";

import { createPoolOptions } from "../src/db.js";

test("createPoolOptions strips sslmode from remote pooled database URLs", () => {
  const options = createPoolOptions(
    "postgres://user:password@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require&supa=base-pooler.x",
  );

  const parsed = new URL(options.connectionString);

  assert.equal(parsed.searchParams.has("sslmode"), false);
  assert.equal(parsed.searchParams.get("supa"), "base-pooler.x");
  assert.deepEqual(options.ssl, { rejectUnauthorized: false });
  assert.equal(options.max, 5);
});

test("createPoolOptions leaves local database URLs untouched", () => {
  const options = createPoolOptions(
    "postgres://postgres:postgres@127.0.0.1:5432/jobfinder?sslmode=disable",
  );

  assert.equal(
    options.connectionString,
    "postgres://postgres:postgres@127.0.0.1:5432/jobfinder?sslmode=disable",
  );
  assert.equal(options.ssl, undefined);
  assert.equal(options.max, 5);
});
