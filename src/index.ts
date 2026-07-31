#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { runAddAppCommand } from "./commands/add.js";
import { runInitCommand } from "./commands/init.js";

type PackageMetadata = {
  version: string;
};

// CLI 版本统一取自 npm 包元数据，避免发布时源码版本与 package.json 不一致。
const require = createRequire(import.meta.url);
const packageMetadata = require("../package.json") as PackageMetadata;

const program = new Command();

program
  .name("cq-work")
  .description("Initialize personal workspaces from cq-framework templates.")
  .version(packageMetadata.version);

program
  .command("init")
  .argument("[projectName]", "new business project directory name")
  .description("Initialize a new business project")
  .option(
    "--template-repo <url>",
    "template repository url used when creating cache",
    "https://github.com/ChaoQunPeng/cq-framework",
  )
  .option("--cache-dir <path>", "local cq-framework cache directory")
  .option("--refresh-template", "pull latest template repository before init")
  .action(async (projectName: string | undefined, options: InitCommandOptions) => {
    try {
      await runInitCommand({ projectName, ...options });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

// add app 只向当前业务项目补充 app，具体的仓库同步和模板复制由命令模块处理。
const addCommand = program
  .command("add")
  .description("Add resources to an existing business project");

addCommand
  .command("app")
  .description("Add apps from the cq-framework repository")
  .option(
    "--template-repo <url>",
    "template repository url used when creating cache",
    "https://github.com/ChaoQunPeng/cq-framework",
  )
  .option("--cache-dir <path>", "local cq-framework cache directory")
  .action(async (options: AddAppCommandOptions) => {
    try {
      await runAddAppCommand(options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program.parseAsync();

type InitCommandOptions = {
  templateRepo: string;
  cacheDir?: string;
  refreshTemplate?: boolean;
};

type AddAppCommandOptions = {
  templateRepo: string;
  cacheDir?: string;
};
