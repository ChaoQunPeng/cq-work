import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import fs from "fs-extra";
import inquirer from "inquirer";

const BASE_TEMPLATE_ENTRIES: BaseTemplateEntry[] = [
  { name: "domain", type: "directory", createWhenMissing: true },
  { name: "shared", type: "directory", createWhenMissing: true },
  { name: "package.json", type: "file" },
  { name: "pnpm-workspace.yaml", type: "file" },
  { name: "README.md", type: "file" },
];

type BaseTemplateEntry = {
  name: string;
  type: "directory" | "file";
  createWhenMissing?: boolean;
};

type InitOptions = {
  projectName?: string;
  templateRepo: string;
  cacheDir?: string;
  refreshTemplate?: boolean;
};

type AppNameAnswer = {
  [key: `appName_${string}`]: string;
};

export async function runInitCommand(options: InitOptions): Promise<void> {
  const frameworkDir = await ensureFrameworkRepo(options);
  const projectName = await resolveProjectName(options.projectName);
  const targetDir = path.resolve(process.cwd(), projectName);

  await assertDirectoryCanBeInitialized(targetDir);
  await copyBaseProjectFiles(frameworkDir, targetDir);
  await updatePackageJsonName(path.join(targetDir, "package.json"), projectName);

  const templates = await readAppTemplates(frameworkDir);
  const selectedTemplates = await selectAppTemplates(templates);
  const appNames = await promptAppNames(selectedTemplates);

  await copySelectedApps(frameworkDir, targetDir, appNames);

  console.log(`\nCreated ${projectName} from cq-framework.`);
  console.log(`Next: cd ${projectName}`);
}

async function ensureFrameworkRepo(options: InitOptions): Promise<string> {
  const frameworkDir =
    options.cacheDir ?? path.join(homedir(), ".cq-work", "cq-framework");

  if (await fs.pathExists(frameworkDir)) {
    if (options.refreshTemplate) {
      // 模板缓存默认复用；需要同步远程时显式刷新，避免每次 init 都访问网络。
      await runGitPull(frameworkDir);
    }

    return frameworkDir;
  }

  await fs.ensureDir(path.dirname(frameworkDir));

  // 模板仓库只缓存到用户目录，不写入 cq-work 项目自身。
  await runGitClone(options.templateRepo, frameworkDir);

  return frameworkDir;
}

function runGitClone(repoUrl: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["clone", repoUrl, targetDir], {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`git clone failed with exit code ${code ?? "unknown"}`));
    });
  });
}

function runGitPull(repoDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", repoDir, "pull", "--ff-only"], {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`git pull failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function resolveProjectName(projectName?: string): Promise<string> {
  if (projectName) {
    return validateDirectoryName(projectName);
  }

  const answer = await inquirer.prompt<{ projectName: string }>([
    {
      type: "input",
      name: "projectName",
      message: "Project name:",
      default: "my-project",
      validate: validatePromptDirectoryName,
    },
  ]);

  return validateDirectoryName(answer.projectName);
}

async function assertDirectoryCanBeInitialized(targetDir: string): Promise<void> {
  if (!(await fs.pathExists(targetDir))) {
    return;
  }

  const entries = await fs.readdir(targetDir);
  if (entries.length > 0) {
    throw new Error(`Target directory already exists and is not empty: ${targetDir}`);
  }
}

async function copyBaseProjectFiles(
  frameworkDir: string,
  targetDir: string,
): Promise<void> {
  await fs.ensureDir(targetDir);
  await fs.ensureDir(path.join(targetDir, "apps"));

  for (const entry of BASE_TEMPLATE_ENTRIES) {
    const source = path.join(frameworkDir, entry.name);
    const target = path.join(targetDir, entry.name);

    if (!(await fs.pathExists(source))) {
      if (entry.type === "directory" && entry.createWhenMissing) {
        // Git 不会保存空目录，缺失的基础目录在初始化时补出来。
        await fs.ensureDir(target);
        continue;
      }

      throw new Error(`Template entry is missing: ${source}`);
    }

    // 只复制项目公共骨架，app 模板会在交互选择后单独复制。
    await fs.copy(source, target, { overwrite: false, errorOnExist: true });
  }
}

async function readAppTemplates(frameworkDir: string): Promise<string[]> {
  const appsDir = path.join(frameworkDir, "apps");

  if (!(await fs.pathExists(appsDir))) {
    throw new Error(`Template apps directory is missing: ${appsDir}`);
  }

  const entries = await fs.readdir(appsDir, { withFileTypes: true });
  const templates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (templates.length === 0) {
    throw new Error(`No app templates found in: ${appsDir}`);
  }

  return templates;
}

async function selectAppTemplates(templates: string[]): Promise<string[]> {
  const answer = await inquirer.prompt<{ selectedTemplates: string[] }>([
    {
      type: "checkbox",
      name: "selectedTemplates",
      message: "Select apps:",
      choices: templates.map((template) => ({
        name: template,
        value: template,
      })),
      validate(value: string[]) {
        return value.length > 0 || "Select at least one app template.";
      },
    },
  ]);

  return answer.selectedTemplates;
}

async function promptAppNames(
  selectedTemplates: string[],
): Promise<Map<string, string>> {
  const questions = selectedTemplates.map((template) => ({
    type: "input",
    name: appNameQuestionKey(template),
    message: `App name for ${template}:`,
    default: template,
    validate: validatePromptDirectoryName,
  }));
  const answer = await inquirer.prompt<AppNameAnswer>(questions);
  const appNames = new Map<string, string>();
  const usedNames = new Set<string>();

  for (const template of selectedTemplates) {
    const appName = validateDirectoryName(answer[appNameQuestionKey(template)]);

    if (usedNames.has(appName)) {
      throw new Error(`Duplicate app name: ${appName}`);
    }

    usedNames.add(appName);
    appNames.set(template, appName);
  }

  return appNames;
}

async function copySelectedApps(
  frameworkDir: string,
  targetDir: string,
  appNames: Map<string, string>,
): Promise<void> {
  for (const [template, appName] of appNames) {
    const source = path.join(frameworkDir, "apps", template);
    const target = path.join(targetDir, "apps", appName);

    // app 模板名和业务项目 app 名可以不同，例如 react-fe -> diary。
    await fs.copy(source, target, { overwrite: false, errorOnExist: true });
    await updatePackageJsonName(path.join(target, "package.json"), appName);
  }
}

async function updatePackageJsonName(
  packageJsonPath: string,
  packageName: string,
): Promise<void> {
  if (!(await fs.pathExists(packageJsonPath))) {
    return;
  }

  const packageJson = await fs.readJson(packageJsonPath);

  if (!isJsonObject(packageJson)) {
    throw new Error(`Invalid package.json: ${packageJsonPath}`);
  }

  // 初始化后 package name 应该使用新项目或新 app 的名称。
  packageJson.name = packageName;

  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function appNameQuestionKey(template: string): `appName_${string}` {
  return `appName_${template}`;
}

function validatePromptDirectoryName(value: string): true | string {
  try {
    validateDirectoryName(value);
    return true;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function validateDirectoryName(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Name is required.");
  }

  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Name must not contain path separators.");
  }

  if (trimmed === "." || trimmed === "..") {
    throw new Error("Name must be a directory name.");
  }

  return trimmed;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
