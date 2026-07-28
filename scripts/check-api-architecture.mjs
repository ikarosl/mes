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
const assertNoMatch = async (directory, pattern, message) => {
  for (const file of await filesUnder(path.join(root, directory))) {
    const source = await readFile(file, 'utf8');
    if (pattern.test(source)) violations.push(`${path.relative(root, file)}: ${message}`);
  }
};

await assertNoMatch(
  'apps/api/src/modules/product/infrastructure',
  /\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:departments|users|roles|permissions|user_roles|role_permissions|refresh_tokens|operation_logs)\b/i,
  'Product 不得直接访问 Identity/System 拥有的表',
);
await assertNoMatch(
  'apps/api/src/modules/identity/infrastructure',
  /\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:product_categories|products|product_materials|technical_files|process_steps|process_routes|process_route_steps)\b/i,
  'Identity/System 不得直接访问 Product 拥有的表',
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

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('API architecture checks passed.');
}
