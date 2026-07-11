#!/usr/bin/env node
import { Command } from "commander";
import { runInitCommand } from "./commands/init.js";
const program = new Command();
program
    .name("cq-work")
    .description("Initialize personal workspaces from cq-framework templates.")
    .version("1.0.0");
program
    .command("init")
    .argument("[projectName]", "new business project directory name")
    .description("Initialize a new business project")
    .option("--template-repo <url>", "template repository url", "https://github.com/ChaoQunPeng/cq-framework")
    .option("--cache-dir <path>", "local cq-framework cache directory")
    .option("--refresh-template", "pull latest template repository before init")
    .action(async (projectName, options) => {
    try {
        await runInitCommand({ projectName, ...options });
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
});
program.parseAsync();
