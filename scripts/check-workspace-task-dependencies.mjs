/**
 * 这个脚本用于校验一个 Turborepo monorepo 的工作区任务配置是否符合约定：
 * 检查各 package 的脚本命名、turbo.json 中任务的依赖
 * 关系（如 `build`、`typecheck`、`test` 等是否依赖 `^build:run`）、
 * 根目录脚本是否通过 Turbo 调用，以及运行时脚本是否使用了正确的 `:run`/`:serve` 后缀。
 * 如果发现问题会输出错误并设置退出码 1，否则提示检查通过。
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = process.cwd();
const failures = [];

const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(workspaceRoot, relativePath), 'utf8'));

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const packageJsonPaths = [];
for (const parent of ['apps', 'packages']) {
  const entries = await readdir(path.join(workspaceRoot, parent), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) packageJsonPaths.push(`${parent}/${entry.name}/package.json`);
  }
}

const rootPackage = await readJson('package.json');
const turbo = await readJson('turbo.json');
const workspacePackages = await Promise.all(
  packageJsonPaths.sort().map(async (packageJsonPath) => ({
    packageJsonPath,
    manifest: await readJson(packageJsonPath),
  })),
);

const assertTaskDependsOn = (taskName, dependency) => {
  const dependsOn = turbo.tasks[taskName]?.dependsOn;
  assert(
    Array.isArray(dependsOn) && dependsOn.includes(dependency),
    `turbo task ${taskName} must depend on ${dependency}`,
  );
};

for (const taskName of ['build:run', 'typecheck:run', 'test:run', 'dev:serve']) {
  assertTaskDependsOn(taskName, '^build:run');
}

for (const taskName of [
  'storage:ensure-bucket:run',
  'ensure-database:run',
  'migrate:run',
  'migrate:status:run',
  'seed:run',
  'seed:demo:run',
  'bootstrap-admin:run',
]) {
  assertTaskDependsOn(taskName, '^build:run');
}

for (const taskName of [
  'ensure-database:compiled:run',
  'migrate:compiled:run',
  'migrate:status:compiled:run',
  'seed:compiled:run',
  'seed:demo:compiled:run',
  'bootstrap-admin:compiled:run',
]) {
  assertTaskDependsOn(taskName, 'build:run');
}

assert(turbo.tasks['dev:serve']?.persistent === true, 'dev:serve must be persistent');
assert(turbo.tasks['dev:serve']?.interruptible === true, 'dev:serve must be interruptible');

for (const [scriptName, taskName] of [
  ['build', 'build:run'],
  ['typecheck', 'typecheck:run'],
  ['test', 'test:run'],
]) {
  assert(
    rootPackage.scripts?.[scriptName] === `turbo run ${taskName}`,
    `root script ${scriptName} must run ${taskName} through Turbo`,
  );
}

for (const [scriptName, command] of [
  ['dev', 'turbo watch dev:serve'],
  ['dev:api', 'turbo watch dev:serve --filter=@company/api'],
  ['dev:admin', 'turbo watch dev:serve --filter=@company/admin-web'],
]) {
  assert(
    rootPackage.scripts?.[scriptName] === command,
    `root script ${scriptName} must use Turbo watch`,
  );
}

assert(
  rootPackage.scripts?.['test:production:mysql']?.includes(
    'turbo run build:run --filter=@company/api',
  ),
  'test:production:mysql must build the API dependency graph through Turbo',
);

for (const { packageJsonPath, manifest } of workspacePackages) {
  const scripts = manifest.scripts ?? {};
  for (const [scriptName, taskName] of [
    ['build', 'build:run'],
    ['typecheck', 'typecheck:run'],
    ['test', 'test:run'],
  ]) {
    assert(scripts[taskName], `${packageJsonPath} must define internal task ${taskName}`);
    assert(
      scripts[scriptName]?.includes(`turbo run ${taskName} --filter=${manifest.name}`),
      `${packageJsonPath} public ${scriptName} must delegate to Turbo task ${taskName}`,
    );
  }

  for (const [scriptName, command] of Object.entries(scripts)) {
    const directlyRunsRuntime = /(?:tsx\s+src\/|node\s+dist\/|vite\s+--host|tsc-watch\s+)/u.test(
      command,
    );
    if (!directlyRunsRuntime) continue;

    assert(
      scriptName.endsWith(':run') || scriptName.endsWith(':serve'),
      `${packageJsonPath} script ${scriptName} runs runtime code without an internal-task suffix`,
    );
    assert(
      turbo.tasks[scriptName],
      `${packageJsonPath} internal runtime task ${scriptName} is missing in turbo.json`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Workspace task dependency check passed (${workspacePackages.length} packages).`);
}
