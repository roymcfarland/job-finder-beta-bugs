import test from "node:test";
import assert from "node:assert/strict";

import { createPoolOptions } from "../src/db.js";

test("createPoolOptions strips sslmode from remote pooled database URLs", () => {
  const options = createPoolOptions(
    "postgres://user:password@pooler.example.com:5432/postgres?sslmode=require&pooler=example",
  );

  const parsed = new URL(options.connectionString);

  assert.equal(parsed.searchParams.has("sslmode"), false);
  assert.equal(parsed.searchParams.get("pooler"), "example");
  assert.deepEqual(options.ssl, { rejectUnauthorized: false });
  assert.equal(options.max, 5);
});

test("createPoolOptions leaves local database URLs untouched", () => {
  const options = createPoolOptions(
    "postgres://postgres:postgres@127.0.0.1:5432/bug_reporter?sslmode=disable",
  );

  assert.equal(
    options.connectionString,
    "postgres://postgres:postgres@127.0.0.1:5432/bug_reporter?sslmode=disable",
  );
  assert.equal(options.ssl, undefined);
  assert.equal(options.max, 5);
});

test("createPoolOptions enforces TLS verification when configured", () => {
  const options = createPoolOptions(
    "postgres://user:password@db.example.com:5432/postgres",
    { sslRejectUnauthorized: true, sslCa: "-----BEGIN CERTIFICATE-----" },
  );

  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.ca, "-----BEGIN CERTIFICATE-----");
});
