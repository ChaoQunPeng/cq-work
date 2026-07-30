import path from "node:path";
import fs from "fs-extra";
import {
  copySelectedApps,
  ensureFrameworkRepo,
  promptAppNames,
  readAppTemplates,
  selectAppTemplates,
  type FrameworkOptions,
} from "./init.js";

type AddAppCommandOptions = FrameworkOptions & {
  projectDir?: string;
};

/**
 * 执行 `cq-work add app` 的完整业务流程。
 * 每次执行都会同步模板仓库，确保用户选择的是 GitHub 上的最新 app 模板。
 * CLI 默认以执行命令的当前目录为目标，测试可显式传入业务项目目录。
 */
export async function runAddAppCommand(
  options: AddAppCommandOptions,
): Promise<void> {
  const projectDir = options.projectDir ?? process.cwd();

  await assertBusinessProject(projectDir);

  const frameworkDir = await ensureFrameworkRepo({
    templateRepo: options.templateRepo,
    cacheDir: options.cacheDir,
    refreshTemplate: true,
  });
  const templates = await readAppTemplates(frameworkDir);
  const selectedTemplates = await selectAppTemplates(templates);
  const appNames = await promptAppNames(selectedTemplates);

  await copySelectedApps(frameworkDir, projectDir, appNames);

  console.log(`\nAdded ${appNames.size} app(s) to ${projectDir}.`);
}

/**
 * 确认命令运行在 cq-work 生成的业务项目中。
 * 该项目按约定始终包含 apps 目录，缺失时继续复制会写入错误位置。
 */
async function assertBusinessProject(projectDir: string): Promise<void> {
  const appsDir = path.join(projectDir, "apps");

  if (!(await fs.pathExists(appsDir))) {
    throw new Error(`Current directory is not a cq-work project: ${projectDir}`);
  }
}
