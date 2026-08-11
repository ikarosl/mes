import { execFileSync } from 'node:child_process';
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
  'http_idempotency_records',
  'technical_files',
  'product_categories',
  'products',
  'process_steps',
  'process_routes',
  'product_materials',
  'process_route_steps',
  'route_step_materials',
  'work_orders',
  'production_batches',
  'batch_step_records',
  'batch_step_reports',
  'batch_step_abnormal_dispositions',
  'production_item_demand',
  'item_batch',
  'inventory_transaction',
  'production_item_allocation',
  'outbound_order',
  'outbound_detail',
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
const migrationNames = (await readdir(migrationsDir))
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrationNameSet = new Set(migrationNames);

for (const name of migrationNames) {
  if (!/^\d{12}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:up|down)\.sql$/.test(name)) {
    violations.push(`${name}: invalid migration filename`);
  }
  if (name.endsWith('.up.sql') && !migrationNameSet.has(name.replace(/\.up\.sql$/, '.down.sql'))) {
    violations.push(`${name}: matching down migration is missing`);
  }
}

const baseSha = process.env.MIGRATION_BASE_SHA?.trim();
if (baseSha) {
  if (!/^[0-9a-f]{7,40}$/i.test(baseSha)) {
    violations.push('MIGRATION_BASE_SHA is not a valid Git commit');
  } else {
    const changes = execFileSync(
      'git',
      ['diff', '--name-status', `${baseSha}...HEAD`, '--', 'packages/database/migrations'],
      { encoding: 'utf8' },
    )
      .split(/\r?\n/)
      .filter(Boolean);
    for (const change of changes) {
      const [status, file] = change.split(/\s+/, 2);
      if (status !== 'A') {
        violations.push(`${file ?? change}: historical migrations are append-only (${status})`);
      }
    }
  }
}

for (const name of migrationNames) {
  const source = await readFile(path.join(migrationsDir, name), 'utf8');
  const temporaryTables = new Set(
    [...source.matchAll(/\bCREATE\s+TEMPORARY\s+TABLE\s+`?([a-z_][a-z0-9_]*)`?/gi)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  for (const model of forbiddenModels) {
    if (
      new RegExp(
        `\\b(?:CREATE\\s+TABLE|ALTER\\s+TABLE|DROP\\s+TABLE|FROM|JOIN|INTO|UPDATE)\\s+\\x60?${model}\\b`,
        'i',
      ).test(source)
    ) {
      violations.push(`${name}: forbidden legacy model ${model}`);
    }
  }
  const touchedTables = source.matchAll(
    /\b(?:CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|ALTER\s+TABLE\s+|DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?|INSERT\s+INTO\s+|DELETE\s+FROM\s+)`?([a-z_][a-z0-9_]*)`?/gi,
  );
  for (const match of touchedTables) {
    const table = match[1].toLowerCase();
    if (temporaryTables.has(table)) continue;
    if (!allowedTables.has(table)) {
      violations.push(
        `${name}: unregistered table ${table}; register ownership and business rules first`,
      );
    }
  }
  for (const rename of source.matchAll(
    /\bRENAME\s+TABLE\s+`?([a-z_][a-z0-9_]*)`?\s+TO\s+`?([a-z_][a-z0-9_]*)`?/gi,
  )) {
    for (const table of [rename[1].toLowerCase(), rename[2].toLowerCase()]) {
      if (!allowedTables.has(table))
        violations.push(`${name}: unregistered renamed table ${table}`);
    }
  }
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Migration readiness checks passed.');
}
