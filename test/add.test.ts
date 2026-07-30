import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "fs-extra";
import inquirer from "inquirer";
import { runAddAppCommand } from "../src/commands/add.js";

/** 执行测试仓库所需的 Git 命令，并在失败时输出 Git 的错误信息。 */
function runGit(repositoryDir: string, ...args: string[]): void {
  const result = spawnSync("git", ["-C", repositoryDir, ...args], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
}

/** 为缓存刷新场景预先 clone 一份模板仓库。 */
function cloneRepository(sourceDir: string, targetDir: string): void {
  const result = spawnSync("git", ["clone", sourceDir, targetDir], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
}

/** 创建一个可被 cq-work clone 的本地模板仓库。 */
async function createTemplateRepository(repositoryDir: string): Promise<void> {
  const templateDir = path.join(repositoryDir, "apps", "react-fe");

  await fs.ensureDir(templateDir);
  await fs.writeJson(path.join(templateDir, "package.json"), {
    name: "react-fe",
  });
  runGit(repositoryDir, "init");
  runGit(repositoryDir, "config", "user.name", "cq-work test");
  runGit(repositoryDir, "config", "user.email", "cq-work@example.com");
  runGit(repositoryDir, "add", ".");
  runGit(repositoryDir, "commit", "-m", "add app template");
}

test("add app clones templates and prompts for the app to add", async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), "cq-work-add-command-"));
  context.after(() => fs.remove(temporaryRoot));

  const templateRepo = path.join(temporaryRoot, "template-repo");
  const cacheDir = path.join(temporaryRoot, "template-cache");
  const projectDir = path.join(temporaryRoot, "business-project");

  await createTemplateRepository(templateRepo);
  await fs.ensureDir(path.join(projectDir, "apps"));

  let promptCount = 0;
  context.mock.method(inquirer, "prompt", async () => {
    promptCount += 1;

    return promptCount === 1
      ? { selectedTemplates: ["react-fe"] }
      : { "appName_react-fe": "journal" };
  });

  await runAddAppCommand({
    projectDir,
    templateRepo,
    cacheDir,
  });

  assert.equal(await fs.pathExists(path.join(cacheDir, ".git")), true);
  assert.equal(promptCount, 2);
  assert.equal(
    (await fs.readJson(path.join(projectDir, "apps", "journal", "package.json"))).name,
    "journal",
  );
});

test("add app pulls new templates before prompting", async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), "cq-work-add-pull-"));
  context.after(() => fs.remove(temporaryRoot));

  const templateRepo = path.join(temporaryRoot, "template-repo");
  const cacheDir = path.join(temporaryRoot, "template-cache");
  const projectDir = path.join(temporaryRoot, "business-project");

  await createTemplateRepository(templateRepo);
  cloneRepository(templateRepo, cacheDir);

  const newTemplateDir = path.join(templateRepo, "apps", "node-api");
  await fs.ensureDir(newTemplateDir);
  await fs.writeJson(path.join(newTemplateDir, "package.json"), {
    name: "node-api",
  });
  runGit(templateRepo, "add", ".");
  runGit(templateRepo, "commit", "-m", "add node api template");

  await fs.ensureDir(path.join(projectDir, "apps"));

  let promptCount = 0;
  context.mock.method(inquirer, "prompt", async () => {
    promptCount += 1;

    return promptCount === 1
      ? { selectedTemplates: ["node-api"] }
      : { "appName_node-api": "orders-api" };
  });

  await runAddAppCommand({
    projectDir,
    templateRepo,
    cacheDir,
  });

  assert.equal(
    (await fs.readJson(path.join(projectDir, "apps", "orders-api", "package.json"))).name,
    "orders-api",
  );
});
