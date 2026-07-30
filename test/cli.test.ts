import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

test("add help exposes the app subcommand", () => {
  const cliPath = path.resolve("src/index.ts");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", cliPath, "add", "--help"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^\s+app\b/m);
});
