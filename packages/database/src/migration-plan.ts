import type { Migration } from './migration-utils.js';

export interface PlannedMigration {
  name: string;
  status: 'applied' | 'pending';
}

export interface MigrationPlan {
  execution: Migration[];
  status: PlannedMigration[];
}

/** Validate all applied migrations before planning pending SQL in registry order. */
export const buildMigrationPlan = (
  migrations: readonly Migration[],
  applied: ReadonlyMap<string, string>,
): MigrationPlan => {
  const byName = new Map(migrations.map((migration) => [migration.name, migration]));
  for (const [name, appliedChecksum] of applied) {
    const migration = byName.get(name);
    if (!migration) throw new Error(`数据库含当前注册表不存在的 migration：${name}`);
    if (migration.checksum !== appliedChecksum)
      throw new Error(`已执行的 migration 内容发生变化：${name}`);
  }

  const execution: Migration[] = [];
  const status: PlannedMigration[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      status.push({ name: migration.name, status: 'applied' });
      continue;
    }
    execution.push(migration);
    status.push({ name: migration.name, status: 'pending' });
  }
  return { execution, status };
};
