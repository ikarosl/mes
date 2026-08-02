import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name === '__tests__') return [];
      return entry.isDirectory() ? filesUnder(target) : target.endsWith('.ts') ? [target] : [];
    }),
  );
  return files.flat();
};

/**
 * 从 @nestjs/common 导入的 Nest HTTP 异常（所有 *Exception 命名导入，不只枚举已知类名）。
 * application / domain 层一律禁止；presentation 层（异常过滤器）是例外，不在扫描目录内。
 * 只匹配 import 块，避免注释或字符串里的类名误报。
 */
const nestHttpExceptionImportPattern =
  /import\s+(?:type\s+)?\{[\s\S]*?\b[A-Z][A-Za-z]*Exception\b[\s\S]*?\}\s*from\s+['"]@nestjs\/common['"]/;

/** 数据库驱动错误码字面量（如 ER_DUP_ENTRY）：application 层一律禁止。 */
const dbDriverCodePattern = /['"]ER_[A-Z_]+['"]/;

/** SDK / 基础设施包：application 层禁止直接依赖。 */
const applicationSdkPattern =
  /from ['"](?:@aws-sdk(?:\/[\w-]+)?|mysql2(?:\/promise)?|typeorm|knex|prisma|sequelize|@company\/database)['"]/i;

/** 模块根 public.ts 不得导出内部 domain 错误类作为跨模块契约。 */
const domainErrorExportPattern = /export\s*\{[\s\S]*?\b[A-Z][A-Za-z]*DomainError\b/;

const operationLogsWritePattern =
  /\b(?:INSERT\s+(?:IGNORE\s+)?INTO\s+|REPLACE(?:\s+INTO)?\s+|UPDATE\s+|DELETE\s+FROM\s+)`?(?:`?\w+`?[.])?`?operation_logs\b/i;

const identityOwnedTables =
  'departments|users|roles|permissions|user_roles|role_permissions|refresh_tokens';
const productOwnedTables =
  'product_categories|products|product_materials|technical_files|process_steps|process_routes|process_route_steps';

/** 检查定义：directory（相对 root）+ pattern + message；可选 exclude / fileMatch。 */
const checks = [
  // 通用 persistence helper 不得依赖 Nest HTTP/框架异常
  {
    directory: 'apps/api/src/common/persistence',
    pattern: /from ['"]@nestjs\//i,
    message: '通用 persistence helper 不得直接依赖 Nest HTTP/框架异常',
  },
  // application / domain 层不得从 @nestjs/common 导入 Nest HTTP 异常；application 不得依赖 SDK
  ...['identity', 'product', 'production'].flatMap((module) => [
    {
      directory: `apps/api/src/modules/${module}/application`,
      pattern: nestHttpExceptionImportPattern,
      message: `${module}/application 不得从 @nestjs/common 导入 Nest HTTP 异常；业务失败应抛出协议无关的模块错误`,
    },
    {
      directory: `apps/api/src/modules/${module}/domain`,
      pattern: nestHttpExceptionImportPattern,
      message: `${module}/domain 不得从 @nestjs/common 导入 Nest HTTP 异常`,
    },
    {
      directory: `apps/api/src/modules/${module}/application`,
      pattern: applicationSdkPattern,
      message: `${module}/application 不得直接依赖数据库、存储等 SDK 包`,
    },
  ]),
  // application 层不得识别数据库驱动错误码（实现错误由 infrastructure 映射）
  ...['product', 'production'].flatMap((module) => [
    {
      directory: `apps/api/src/modules/${module}/application`,
      pattern: dbDriverCodePattern,
      message: `${module}/application 不得识别数据库驱动错误码；实现错误由 infrastructure 映射为模块错误`,
    },
  ]),
  // application port 不得泄漏 mysql2 类型
  ...['identity', 'product', 'production'].flatMap((module) => [
    {
      directory: `apps/api/src/modules/${module}/application/ports`,
      pattern: /from ['"]mysql2(?:\/promise)?['"]/i,
      message: `${module} application port 不得泄漏 mysql2 类型`,
    },
  ]),
  // 数据表所有权：禁止跨模块直接访问其他模块拥有的表
  {
    directory: 'apps/api/src/modules/product/infrastructure',
    pattern: new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE)\\s+(?:${identityOwnedTables})\\b`, 'i'),
    message: 'Product 不得直接访问 Identity/System 拥有的业务表',
  },
  {
    directory: 'apps/api/src/modules/identity/infrastructure',
    pattern: new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE)\\s+(?:${productOwnedTables})\\b`, 'i'),
    message: 'Identity/System 不得直接访问 Product 拥有的表',
  },
  {
    directory: 'apps/api/src/modules/production/infrastructure',
    pattern: new RegExp(
      `\\b(?:FROM|JOIN|INTO|UPDATE)\\s+(?:${identityOwnedTables}|${productOwnedTables})\\b`,
      'i',
    ),
    message: 'Production 不得直接访问 Identity/System 或 Product 拥有的表',
  },
  // 跨模块深层 import：只能通过目标模块 public.ts
  {
    directory: 'apps/api/src/modules/product',
    pattern:
      /from ['"](?:\.\.\/identity\/(?!public(?:\.js)?['"])|.*\/modules\/identity\/(?!public(?:\.js)?['"]))/,
    message: 'Product 跨模块依赖只能通过 Identity public.ts',
  },
  {
    directory: 'apps/api/src/modules/identity',
    pattern:
      /from ['"](?:\.\.\/product\/(?!public(?:\.js)?['"])|.*\/modules\/product\/(?!public(?:\.js)?['"]))/,
    message: 'Identity/System 跨模块依赖只能通过 Product public.ts',
  },
  // 模块根 public.ts 不得把内部 domain 错误类作为跨模块契约导出
  {
    directory: 'apps/api/src/modules',
    pattern: domainErrorExportPattern,
    message: '模块 public.ts 不得导出内部 domain 错误类作为跨模块契约',
    fileMatch: (relative) => relative.endsWith('public.ts'),
  },
  // operation_logs 是平台级审计基础设施：写入通道只能由事务审计写入器承担
  {
    directory: 'apps/api/src',
    pattern: operationLogsWritePattern,
    message: 'operation_logs 只能由 common/audit/transactional-audit-writer 写入',
    exclude: ['apps/api/src/common/audit/transactional-audit-writer.ts'],
  },
];

const isUnder = (relative, directory) =>
  relative === directory || relative.startsWith(`${directory}/`);

const applyChecks = (sources, violations) => {
  for (const { path: relative, source } of sources) {
    for (const check of checks) {
      if (check.exclude?.includes(relative)) continue;
      if (check.fileMatch) {
        if (!check.fileMatch(relative)) continue;
      } else if (!isUnder(relative, check.directory)) {
        continue;
      }
      if (check.pattern.test(source)) violations.push(`${relative}: ${check.message}`);
    }
  }
};

const collectSources = async () => {
  const directories = [...new Set(checks.map((check) => check.directory))];
  const files = new Set();
  for (const directory of directories) {
    for (const file of await filesUnder(path.join(root, directory))) {
      files.add(path.relative(root, file).split(path.sep).join('/'));
    }
  }
  const sources = [];
  for (const relative of files) {
    sources.push({ path: relative, source: await readFile(path.join(root, relative), 'utf8') });
  }
  return sources;
};

/**
 * 源码级架构检查。extraSources 用于回归测试注入反例（虚拟文件），验证检查器确实能拦截违规代码；
 * 每个元素为 { path: 相对路径, source: 源码文本 }。
 */
export const checkApiArchitecture = async (extraSources = []) => {
  const violations = [];
  applyChecks([...((await collectSources()) ?? []), ...extraSources], violations);
  return violations;
};

const main = async () => {
  const violations = await checkApiArchitecture();
  if (violations.length > 0) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('API architecture checks passed.');
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
