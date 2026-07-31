import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

type PackageMetadata = {
  version: string;
};

// 运行源码 CLI，覆盖开发阶段实际使用的命令入口。
function runCli(...args: string[]) {
  const cliPath = path.resolve("src/index.ts");

  return spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
    encoding: "utf8",
  });
}

test("add help exposes the app subcommand", () => {
  const result = runCli("add", "--help");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^\s+app\b/m);
});

test("version matches package.json", () => {
  const packageMetadata = JSON.parse(
    readFileSync(path.resolve("package.json"), "utf8"),
  ) as PackageMetadata;
  const result = runCli("--version");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), packageMetadata.version);
});
