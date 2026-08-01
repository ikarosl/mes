import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

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

const violations = [];
const assertNoMatch = async (directory, pattern, message, { exclude = [] } = {}) => {
  for (const file of await filesUnder(path.join(root, directory))) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (exclude.includes(relative)) continue;
    const source = await readFile(file, 'utf8');
    if (pattern.test(source)) violations.push(`${path.relative(root, file)}: ${message}`);
  }
};

await assertNoMatch(
  'apps/api/src/common/persistence',
  /from ['"]@nestjs\//i,
  '通用 persistence helper 不得直接依赖 Nest HTTP/框架异常',
);
await assertNoMatch(
  'apps/api/src/modules/production/application',
  /\b(?:BadRequestException|ConflictException|NotFoundException|HttpException)\b/,
  'Production application 不得抛出 Nest HTTP 异常',
);
await assertNoMatch(
  'apps/api/src/modules/production/domain',
  /\b(?:BadRequestException|ConflictException|NotFoundException|HttpException)\b/,
  'Production domain 不得抛出 Nest HTTP 异常',
);

await assertNoMatch(
  'apps/api/src/modules/product/infrastructure',
  /\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:departments|users|roles|permissions|user_roles|role_permissions|refresh_tokens)\b/i,
  'Product 不得直接访问 Identity/System 拥有的业务表',
);
await assertNoMatch(
  'apps/api/src/modules/identity/infrastructure',
  /\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:product_categories|products|product_materials|technical_files|process_steps|process_routes|process_route_steps)\b/i,
  'Identity/System 不得直接访问 Product 拥有的表',
);
await assertNoMatch(
  'apps/api/src/modules/production/infrastructure',
  /\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:departments|users|roles|permissions|user_roles|role_permissions|refresh_tokens|product_categories|products|product_materials|technical_files|process_steps|process_routes|process_route_steps)\b/i,
  'Production 不得直接访问 Identity/System 或 Product 拥有的表',
);
await assertNoMatch(
  'apps/api/src/modules/identity/application/ports',
  /from ['"]mysql2(?:\/promise)?['"]/i,
  'application port 不得泄漏 mysql2 类型',
);
await assertNoMatch(
  'apps/api/src/modules/product/application/ports',
  /from ['"]mysql2(?:\/promise)?['"]/i,
  'application port 不得泄漏 mysql2 类型',
);
await assertNoMatch(
  'apps/api/src/modules/product',
  /from ['"](?:\.\.\/identity\/(?!public(?:\.js)?['"])|.*\/modules\/identity\/(?!public(?:\.js)?['"]))/,
  'Product 跨模块依赖只能通过 Identity public.ts',
);
await assertNoMatch(
  'apps/api/src/modules/identity',
  /from ['"](?:\.\.\/product\/(?!public(?:\.js)?['"])|.*\/modules\/product\/(?!public(?:\.js)?['"]))/,
  'Identity/System 跨模块依赖只能通过 Product public.ts',
);

// operation_logs 是平台级审计基础设施：写入通道是跨模块公共能力，只能由事务审计写入器承担，
// 不归属任何业务模块；读审计仍通过 Identity 的公开查询能力（FROM operation_logs 不在禁止范围）。
// 匹配 INSERT [IGNORE] INTO / REPLACE [INTO] / UPDATE / DELETE FROM，容忍反引号表名和 schema 前缀。
const operationLogsWritePattern =
  /\b(?:INSERT\s+(?:IGNORE\s+)?INTO\s+|REPLACE(?:\s+INTO)?\s+|UPDATE\s+|DELETE\s+FROM\s+)`?(?:`?\w+`?[.])?`?operation_logs\b/i;
await assertNoMatch(
  'apps/api/src',
  operationLogsWritePattern,
  'operation_logs 只能由 common/audit/transactional-audit-writer 写入',
  { exclude: ['apps/api/src/common/audit/transactional-audit-writer.ts'] },
);

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('API architecture checks passed.');
}
