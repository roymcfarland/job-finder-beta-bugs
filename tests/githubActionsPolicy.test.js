import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const WORKFLOW_DIR = path.join(process.cwd(), ".github", "workflows");
const WORKFLOW_EXTENSIONS = new Set([".yml", ".yaml"]);

function stripComment(line) {
  const commentIndex = line.indexOf("#");
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function includesScheduledTrigger(source) {
  return source
    .split(/\r?\n/)
    .map(stripComment)
    .some((line) => /^\s*(?:-\s*)?(?:schedule|cron)\s*:/.test(line));
}

test("GitHub Actions workflows do not include scheduled cron triggers", async () => {
  const entries = await readdir(WORKFLOW_DIR, { withFileTypes: true });
  const workflowFiles = entries
    .filter((entry) => entry.isFile() && WORKFLOW_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.join(WORKFLOW_DIR, entry.name));

  assert.ok(workflowFiles.length > 0, "Expected at least one GitHub Actions workflow.");

  const scheduledWorkflows = [];

  for (const file of workflowFiles) {
    const source = await readFile(file, "utf8");
    if (includesScheduledTrigger(source)) {
      scheduledWorkflows.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepEqual(
    scheduledWorkflows,
    [],
    "Scheduled GitHub Actions cron triggers are intentionally disabled.",
  );
});
