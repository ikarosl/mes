import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'packages/database/migrations');
const allowedTables = new Set([
  'departments',
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'refresh_tokens',
  'operation_logs',
  'technical_files',
  'product_categories',
  'products',
  'process_steps',
  'process_routes',
  'product_materials',
  'process_route_steps',
  'route_step_materials',
]);
const forbiddenModels = [
  'item_type',
  'item_info',
  'product_bom',
  'processes',
  'material_batches',
  'batch_material_usages',
];
const violations = [];

for (const name of (await readdir(migrationsDir))
  .filter((file) => file.endsWith('.up.sql'))
  .sort()) {
  const source = await readFile(path.join(migrationsDir, name), 'utf8');
  for (const model of forbiddenModels) {
    if (
      new RegExp(
        `\\b(?:CREATE\\s+TABLE|ALTER\\s+TABLE|FROM|JOIN|INTO|UPDATE)\\s+\\x60?${model}\\b`,
        'i',
      ).test(source)
    )
      violations.push(`${name}: forbidden legacy model ${model}`);
  }
  for (const match of source.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z_]+)`?/gi,
  )) {
    const table = match[1].toLowerCase();
    if (!allowedTables.has(table))
      violations.push(
        `${name}: unregistered table ${table}; register ownership and version/idempotency rules first`,
      );
  }
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Migration readiness checks passed.');
}
