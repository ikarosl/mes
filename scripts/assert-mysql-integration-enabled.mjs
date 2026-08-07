import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const displayValue = (value) =>
  value === undefined || value === '' ? '(未设置或为空)' : `"${value}"`;

/**
 * 加载仓库根 `.env`（语义与 @company/config 的 loadWorkspaceEnv 一致）：
 * - 只在 process.env 中不存在该键时写入，系统环境变量 / PowerShell $env: 优先于 .env；
 * - 跳过注释行、空行与含引号的行；
 * - 自包含实现、不引入依赖，保证门禁在任何构建之前可独立运行。
 */
const loadWorkspaceEnv = () => {
  let content;
  try {
    content = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env'), 'utf8');
  } catch {
    return; // 没有 .env 时静默跳过，CI 以作业 env 注入为准
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.includes('"') || line.includes("'")) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!key) continue;
    if (process.env[key] === undefined) process.env[key] = line.slice(eqIndex + 1).trim();
  }
};

const envFixHint =
  '系统环境变量（PowerShell $env:）优先于 .env：脚本加载 .env 时不会覆盖已注入的变量，两者冲突时以系统环境为准。';

const psPrefix =
  "PowerShell 临时变量：`$env:RUN_MYSQL_INTEGRATION='1'; $env:TEST_DB_NAME='easy_mes_test'; $env:DB_NAME='easy_mes_test'; pnpm test:production:mysql`";
const bashPrefix =
  'Bash 临时变量：`RUN_MYSQL_INTEGRATION=1 TEST_DB_NAME=easy_mes_test DB_NAME=easy_mes_test pnpm test:production:mysql`';

export const assertMysqlIntegrationEnabled = (environment = process.env) => {
  if (environment.RUN_MYSQL_INTEGRATION !== '1') {
    throw new Error(
      `拒绝执行 MySQL 集成初始化：必须显式设置 RUN_MYSQL_INTEGRATION=1（当前值：${displayValue(
        environment.RUN_MYSQL_INTEGRATION,
      )}）。` +
        '修复（二选一）：' +
        '① 本地：在仓库根 .env 中写入 `RUN_MYSQL_INTEGRATION=1`（脚本会先加载 .env 再判定）；' +
        `② 临时环境变量：${psPrefix}；或 ${bashPrefix}。` +
        envFixHint,
    );
  }

  const testDbName = environment.TEST_DB_NAME;
  if (!testDbName) {
    throw new Error(
      `拒绝执行 MySQL 集成初始化：TEST_DB_NAME 未设置或为空（当前值：${displayValue(testDbName)}）。` +
        '修复（二选一）：' +
        '① 本地：在仓库根 .env 中设置 `TEST_DB_NAME=easy_mes_test`（同时把 DB_NAME 改为同值，见下一条门禁）；' +
        `② 临时环境变量：${psPrefix}；或 ${bashPrefix}。` +
        envFixHint,
    );
  }

  if (environment.DB_NAME !== testDbName) {
    throw new Error(
      `拒绝执行 MySQL 集成初始化：DB_NAME 必须与 TEST_DB_NAME 完全相等（当前 DB_NAME：${displayValue(
        environment.DB_NAME,
      )}，TEST_DB_NAME：${displayValue(testDbName)}）。` +
        '修复（二选一）：' +
        '① 本地：在仓库根 .env 中同时设置 `DB_NAME=easy_mes_test` 与 `TEST_DB_NAME=easy_mes_test`；' +
        `② 临时环境变量：${psPrefix}；或 ${bashPrefix}。` +
        '严禁让 DB_NAME 回退到运行时库名或指向开发/生产库。' +
        envFixHint,
    );
  }

  if (!/^.+_test$/.test(testDbName)) {
    throw new Error(
      `拒绝执行 MySQL 集成初始化：DB_NAME 必须以 _test 结尾（当前 DB_NAME：${displayValue(testDbName)}）。` +
        '修复（二选一）：' +
        '① 本地：在仓库根 .env 中设置 `DB_NAME=easy_mes_test` 与 `TEST_DB_NAME=easy_mes_test`；' +
        `② 临时环境变量：${psPrefix}；或 ${bashPrefix}。` +
        '开发/生产库名（easy_mes、company_mes_next）一律拒绝。' +
        envFixHint,
    );
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadWorkspaceEnv(); // 先加载仓库根 .env，再执行门禁判定
  try {
    assertMysqlIntegrationEnabled();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
