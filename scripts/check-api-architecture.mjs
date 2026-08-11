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

const idempotencyRecordsWritePattern =
  /\b(?:INSERT\s+(?:IGNORE\s+)?INTO\s+|REPLACE(?:\s+INTO)?\s+|UPDATE\s+|DELETE\s+FROM\s+)`?(?:`?\w+`?[.])?`?http_idempotency_records\b/i;

/**
 * 已冻结的幂等 scope 值清单：镜像各模块 `*-idempotency.contract.ts` 中
 * `export const ..._SCOPE = '<value>' as const`。清单由架构检查自校验
 * （见 applyIdempotencyBindingChecks 规则 1）：契约文件导出未登记的 scope 值会被直接拦截，
 * 新增 scope 时无需人工记得同步。生产源码（契约常量文件除外）禁止出现这些值的字符串字面量
 * ——scope 只能经由契约常量标识符引用。
 */
const knownIdempotencyScopes = [
  'production.batch.create.v2',
  'production.material-allocation.create.v1',
  'production.material-outbound.create.v1',
  'production.step-report.create.v1',
  'production.step-report.correct.v1',
];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idempotencyScopeLiteralPattern = new RegExp(
  `['"](?:${knownIdempotencyScopes.map(escapeRegExp).join('|')})['"]`,
);

const isPresentationHttpFile = (relative) => relative.includes('/presentation/http/');
const isApplicationLayerFile = (relative) => relative.includes('/application/');
const isRepositoryBoundaryFile = (relative) =>
  relative.includes('/application/ports/') || relative.includes('/infrastructure/');

/** 幂等契约文件：*-idempotency.contract.ts（scope 值的唯一事实来源）。 */
const isContractFile = (relative) =>
  relative.startsWith('apps/api/src/') && relative.endsWith('-idempotency.contract.ts');

/**
 * 具名 import 解析：返回 [{ local, exported, specifier }]。
 * 兼容 `import type`、默认 + 具名混合（`import A, { B }`）、`{ type X }` 与 `as` 别名。
 */
const parseNamedImports = (source) => {
  const imports = [];
  const pattern =
    /import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    const [, namesBlock, specifier] = match;
    for (const raw of namesBlock.split(',')) {
      const name = raw
        .trim()
        .replace(/^type\s+/, '')
        .trim();
      if (!name) continue;
      const [exported, local] = name.split(/\s+as\s+/);
      imports.push({ local: local || exported, exported, specifier });
    }
  }
  return imports;
};

/** 相对 import 解析为仓库内路径（.js → .ts）；非相对 specifier 返回 null。 */
const resolveRelativeImport = (fileRelative, specifier) => {
  if (!specifier.startsWith('.')) return null;
  return path.posix
    .normalize(path.posix.join(path.posix.dirname(fileRelative), specifier))
    .replace(/\.js$/, '.ts');
};

/** 提取契约文件 `export const NAME = '<value>'` 的 scope 常量导出：{ name: value }。 */
const extractContractExports = (source) => {
  const exports = {};
  const pattern = /export\s+const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    exports[match[1]] = match[2];
  }
  return exports;
};

/** 去掉注释（检测专用副本）：避免注释里的标识符触发跨文件检查。 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const identityOwnedTables =
  'departments|users|roles|permissions|user_roles|role_permissions|refresh_tokens';
const productOwnedTables =
  'product_categories|products|product_materials|technical_files|process_steps|process_routes|process_route_steps';

/** 检查定义：directory（相对 root）+ pattern + message；可选 exclude / fileMatch。 */
const checks = [
  // 命令审计上下文与 HTTP 幂等能力必须正交：旧兼容类型已完成迁移，不得重新引入。
  {
    directory: 'apps/api/src',
    pattern: /\b(?:AuditContext|CurrentAuditContext)\b/,
    message:
      '已废弃的 AuditContext/CurrentAuditContext 不得重新引入；普通命令使用 CommandContext，幂等端点使用 IdempotentCommandContext',
  },
  {
    directory: 'apps/api/src/common/audit',
    pattern: /interface\s+CommandContext\s*\{[^}]*\bidempotencyKey\b/s,
    message: 'CommandContext 只能承载命令审计元数据，不得包含 idempotencyKey',
    fileMatch: (relative) => relative === 'apps/api/src/common/audit/audit.types.ts',
  },
  {
    directory: 'apps/api/src/modules',
    pattern: /\bIdempotentCommandContext\b/,
    message:
      'Repository Port/Adapter 不得依赖 IdempotentCommandContext；HTTP 幂等能力止于 application 用例',
    fileMatch: isRepositoryBoundaryFile,
  },
  // 当前登记的幂等用例必须显式列入本白名单并具备版本化契约与测试。
  {
    directory: 'apps/api/src/modules',
    pattern: /\bIdempotentCommandContext\b/,
    message:
      '只有已登记的 Production 幂等命令可使用 IdempotentCommandContext；新增命令必须先完成契约登记与验收',
    exclude: [
      'apps/api/src/modules/production/application/production.service.ts',
      'apps/api/src/modules/production/application/production-material.service.ts',
      'apps/api/src/modules/production/application/production-reporting.service.ts',
      'apps/api/src/modules/production/presentation/http/production.controller.ts',
      'apps/api/src/modules/production/presentation/http/production-material.controller.ts',
      'apps/api/src/modules/production/presentation/http/production-reporting.controller.ts',
    ],
  },
  {
    directory: 'apps/api/src/modules',
    pattern: /\bIdempotencyExecutor\b/,
    message:
      '只有已登记的 Production application 用例可依赖 IdempotencyExecutor；新增用例必须先完成契约登记与验收',
    exclude: [
      'apps/api/src/modules/production/application/production.service.ts',
      'apps/api/src/modules/production/application/production-material.service.ts',
      'apps/api/src/modules/production/application/production-reporting.service.ts',
    ],
    fileMatch: isApplicationLayerFile,
  },
  // Guard 只能存在于项目级幂等基础设施，避免业务模块再次形成相反契约实现。
  {
    directory: 'apps/api/src',
    pattern: /\bclass\s+IdempotencyKeyGuard\b/,
    message: 'IdempotencyKeyGuard 只能定义在项目级 infrastructure/idempotency 中',
    exclude: ['apps/api/src/infrastructure/idempotency/idempotency-key.guard.ts'],
  },
  // 管理端只有已完成后端闭环的 API wrapper 可发送幂等头并开启非安全方法重试。
  {
    directory: 'apps/admin-web/src',
    pattern: /(?:['"]Idempotency-Key['"]\s*:|\bretryUnsafe\s*:)/,
    message:
      '只有已登记的 production API wrapper 可设置 Idempotency-Key/retryUnsafe；新增调用必须先登记后端幂等契约',
    exclude: ['apps/admin-web/src/api/production.ts'],
  },
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
  // http_idempotency_records 是平台级幂等基础设施：业务写入入口只能是 MySQL executor，
  // 到期物理清理只能由 housekeeping 承担，二者同属 infrastructure/idempotency 平台
  {
    directory: 'apps/api/src',
    pattern: idempotencyRecordsWritePattern,
    message:
      'http_idempotency_records 只能由 infrastructure/idempotency 平台内部写入（executor 业务登记/更新，housekeeping 到期清理）',
    exclude: [
      'apps/api/src/infrastructure/idempotency/mysql-idempotency.executor.ts',
      'apps/api/src/infrastructure/idempotency/idempotency-housekeeping.service.ts',
    ],
  },
  // 组合根只能引用业务模块 public.ts 公开装配对象与项目级基础设施/展示装配，不得深入模块内部层
  {
    directory: 'apps/api/src',
    pattern:
      /from ['"]\.\/modules\/(?:identity|product|production)\/(?!public(?:\.js)?['"])[^'"]*['"]/,
    message:
      '组合根 app.module.ts 只能通过模块 public.ts 引用业务模块，不得引用模块内部层（application/domain/presentation/infrastructure）',
    fileMatch: (relative) => relative === 'apps/api/src/app.module.ts',
  },
  // 幂等「声明↔scope↔executor 接入」交叉校验：@IdempotentEndpoint 携带稳定 scope，
  // 但 scope 唯一事实来源是各模块 *-idempotency.contract.ts 契约常量；任何字面量副本都会让
  // 「Guard 证明启用了幂等」与「Service 真的经 executor 接入同一 scope」脱钩，构成伪幂等。
  // 规则 a：scope 字面量只能出现在契约常量文件内，其余生产源码禁止硬编码。
  // 契约文件按命名自动豁免（isContractFile），新增契约文件无需维护 exclude 清单
  {
    directory: 'apps/api/src',
    pattern: idempotencyScopeLiteralPattern,
    message:
      '幂等 scope 字面量禁止硬编码在生产源码中；只能引用本模块幂等契约常量（如 CREATE_BATCH_IDEMPOTENCY_SCOPE）',
    exclude: isContractFile,
  },
  // 规则 b：@IdempotentEndpoint 必须携带 scope 且实参是标识符引用（{ scope: 契约常量 }），禁止字面量
  {
    directory: 'apps/api/src',
    pattern: /@IdempotentEndpoint\(\s*\{[\s\S]*?\bscope\s*:\s*['"]/,
    message: '@IdempotentEndpoint 的 scope 必须是标识符引用（{ scope: 契约常量 }），禁止字面量',
    fileMatch: isPresentationHttpFile,
  },
  {
    directory: 'apps/api/src',
    pattern: /@IdempotentEndpoint\(\s*\)/,
    message: '@IdempotentEndpoint 必须携带 scope（{ scope: 契约常量 }）',
    fileMatch: isPresentationHttpFile,
  },
  {
    directory: 'apps/api/src',
    pattern: /@IdempotentEndpoint\(/,
    requires: [/from\s+['"][^'"]+idempotency\.contract\.js['"]/],
    message:
      '声明 @IdempotentEndpoint 的 Controller 必须 import 本模块幂等契约 scope 常量（*-idempotency.contract.ts）',
    fileMatch: isPresentationHttpFile,
  },
  {
    directory: 'apps/api/src',
    pattern: /@IdempotentEndpoint\(/,
    requires: [/\bCurrentIdempotentCommandContext\b/],
    message:
      '声明 @IdempotentEndpoint 的 Controller 必须使用 CurrentIdempotentCommandContext 获取已校验的键',
    fileMatch: isPresentationHttpFile,
  },
  {
    directory: 'apps/api/src',
    pattern: /@CurrentIdempotentCommandContext\(\)/,
    requires: [/@IdempotentEndpoint\(/],
    message: 'CurrentIdempotentCommandContext 只能用于声明了 @IdempotentEndpoint 的 Controller',
    fileMatch: isPresentationHttpFile,
  },
  // 规则 c：application 层对幂等 executor 的 execute 调用必须引用契约 scope 常量，禁止字面量
  {
    directory: 'apps/api/src/modules',
    pattern: /execute\(\s*\{[\s\S]*?\bscope\s*:\s*['"]/,
    message:
      '幂等 executor 的 execute 调用必须引用契约 scope 常量（如 CREATE_BATCH_IDEMPOTENCY_SCOPE），禁止字面量',
    fileMatch: isApplicationLayerFile,
  },
];

const isUnder = (relative, directory) =>
  relative === directory || relative.startsWith(`${directory}/`);

const applyChecks = (sources, violations) => {
  for (const { path: relative, source } of sources) {
    for (const check of checks) {
      if (check.exclude !== undefined) {
        const excluded =
          typeof check.exclude === 'function'
            ? check.exclude(relative)
            : check.exclude.includes(relative);
        if (excluded) continue;
      }
      if (check.fileMatch) {
        if (!check.fileMatch(relative)) continue;
      } else if (!isUnder(relative, check.directory)) {
        continue;
      }
      const patternMatched = check.pattern.test(source);
      // requires：可选的正则数组，全部命中才算合规；pattern 命中但 requires 缺一即违规。
      const requiresSatisfied = check.requires?.every((r) => r.test(source)) ?? true;
      if (patternMatched && (check.requires === undefined || !requiresSatisfied)) {
        violations.push(`${relative}: ${check.message}`);
      }
    }
  }
};

/**
 * 幂等「声明↔scope↔executor 接入」显式绑定（跨文件关联，正则 checks 表覆盖不到的深度）：
 * 1. 契约文件（*-idempotency.contract.ts）导出的每个 scope 值必须登记在 knownIdempotencyScopes
 *    ——清单自校验，新增 scope 无法绕过登记，也不用人工记得同步；
 * 2. 每个 `@IdempotentEndpoint({ scope: X })` 的 X 必须是本文件对模块幂等契约文件的具名导入，
 *    且是契约文件实际导出的常量（防止「import 了契约却用别的标识符」）；
 * 3. 同一模块 application 层必须存在「import 同一契约文件 + execute({ scope: X })」的接线——
 *    装饰器与 executor 用同一个契约常量标识符，防止「声明了幂等但业务路径没走 executor」的假闭环。
 */
const applyIdempotencyBindingChecks = (sources, violations) => {
  const byPath = new Map(sources.map((s) => [s.path, s.source]));

  // 规则 1：契约文件导出的 scope 值必须已登记
  for (const [relative, source] of byPath) {
    if (!isContractFile(relative)) continue;
    for (const [name, value] of Object.entries(extractContractExports(stripComments(source)))) {
      if (!knownIdempotencyScopes.includes(value)) {
        violations.push(
          `${relative}: 幂等契约导出的 scope '${value}'（${name}）未登记到 knownIdempotencyScopes；新增 scope 必须同步登记`,
        );
      }
    }
  }

  // 规则 2/3：装饰器 scope 与 application executor 使用同一契约常量
  const decoratorScopePattern = /@IdempotentEndpoint\(\s*\{\s*scope\s*:\s*(\w+)\s*\}\)/g;
  for (const [relative, rawSource] of byPath) {
    if (!isPresentationHttpFile(relative)) continue;
    const source = stripComments(rawSource);
    for (const match of source.matchAll(decoratorScopePattern)) {
      const scopeName = match[1];
      const imported = parseNamedImports(source).find((imp) => imp.local === scopeName);
      if (!imported || !imported.specifier.startsWith('.')) {
        violations.push(
          `${relative}: @IdempotentEndpoint 的 scope '${scopeName}' 必须来自本模块幂等契约文件（*-idempotency.contract.ts）的具名导入`,
        );
        continue;
      }
      const contractPath = resolveRelativeImport(relative, imported.specifier);
      const contractSource = contractPath ? byPath.get(contractPath) : undefined;
      if (!contractPath?.endsWith('-idempotency.contract.ts') || !contractSource) {
        violations.push(
          `${relative}: @IdempotentEndpoint 的 scope '${scopeName}' 必须来自模块幂等契约文件（*-idempotency.contract.ts），当前来源 ${imported.specifier}`,
        );
        continue;
      }
      if (!(scopeName in extractContractExports(stripComments(contractSource)))) {
        violations.push(
          `${relative}: @IdempotentEndpoint 的 scope '${scopeName}' 不是契约文件 ${contractPath} 的导出常量`,
        );
        continue;
      }
      // 规则 3：契约文件所在模块的 application 层必须经 executor 以同一常量接入。
      // 已知近似性（评审记录）：本规则只证明模块 application 层存在「import 同一契约 + execute({ scope })」
      // 的代码，不证明 Controller 方法实际调用的就是该路径——同模块中一段无关或不可达的
      // execute({ scope }) 也能满足检查。当前 createBatch 经人工审查确认真实接线正确，非阻塞项；
      // 后续端点增多时升级为显式 contract registry（application 层注册 scope→executor 绑定）或
      // AST 级控制流检查，以闭合 Controller → application 调用链。
      const moduleRoot = contractPath.replace(/^apps\/api\/src\/modules\//, '').split('/')[0];
      const wired = [...byPath.entries()].some(([appRelative, appRaw]) => {
        if (!appRelative.startsWith(`apps/api/src/modules/${moduleRoot}/application/`))
          return false;
        const appSource = stripComments(appRaw);
        const importsContract = parseNamedImports(appSource).some(
          (imp) =>
            imp.specifier.startsWith('.') &&
            resolveRelativeImport(appRelative, imp.specifier) === contractPath,
        );
        if (!importsContract) return false;
        // 允许 execute<TGeneric>({ ... }) 形态（service 常用泛型标注返回类型）
        return new RegExp(
          `execute(?:\\s*<[^>]*>)?\\s*\\(\\s*\\{[\\s\\S]*?\\bscope\\s*:\\s*${scopeName}\\b`,
        ).test(appSource);
      });
      if (!wired) {
        violations.push(
          `${relative}: 端点 @IdempotentEndpoint 的 scope '${scopeName}' 未在 ${moduleRoot} application 层经 executor 以同一契约常量接入（需要 import 同一契约文件并 execute({ scope: ${scopeName} })）`,
        );
      }
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
  const sources = [...((await collectSources()) ?? []), ...extraSources];
  applyChecks(sources, violations);
  applyIdempotencyBindingChecks(sources, violations);
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
