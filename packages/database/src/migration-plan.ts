import type { Migration } from './migration-utils.js';

export const preservedInventoryMigration = {
  name: '202610150001-preserve-general-inventory-documents.up.sql',
  replaces: '202610140001-general-inventory-documents.up.sql',
  // The unexecuted original remains immutable even on the alternative path.
  originalChecksum: 'b9f3372246f49ed87a85dea8506c9c8285c2477d8636f4b5c215cca2cb668150',
} as const;

export type MigrationMode = 'standard' | 'preserve-general-inventory';
export type PlannedMigrationStatus = 'applied' | 'pending' | 'superseded' | 'not-required';

export interface PlannedMigration {
  name: string;
  status: PlannedMigrationStatus;
  alternative?: string;
}

export interface MigrationPlan {
  execution: Migration[];
  status: PlannedMigration[];
}

export const readMigrationMode = (value: string | undefined): MigrationMode => {
  if (value === undefined || value === '' || value === 'standard') return 'standard';
  if (value === 'preserve-general-inventory') return value;
  throw new Error('DB_MIGRATION_MODE 必须为 standard 或 preserve-general-inventory');
};

/** Select a real alternative migration; never insert a record for SQL that did not run. */
export const buildMigrationPlan = (
  migrations: readonly Migration[],
  applied: ReadonlyMap<string, string>,
  mode: MigrationMode,
): MigrationPlan => {
  const byName = new Map(migrations.map((migration) => [migration.name, migration]));
  for (const [name, appliedChecksum] of applied) {
    const migration = byName.get(name);
    if (!migration) throw new Error(`数据库含当前注册表不存在的 migration：${name}`);
    if (migration.checksum !== appliedChecksum)
      throw new Error(`已执行的 migration 内容发生变化：${name}`);
  }

  const original = byName.get(preservedInventoryMigration.replaces);
  const alternative = byName.get(preservedInventoryMigration.name);
  if (!original || !alternative) throw new Error('公共出入库 migration 替代声明缺少配对文件');
  const originalApplied = applied.has(original.name);
  const alternativeApplied = applied.has(alternative.name);
  if (originalApplied && alternativeApplied)
    throw new Error('公共出入库原迁移和保留数据替代迁移不得同时登记');

  const selectAlternative = mode === 'preserve-general-inventory' && !originalApplied;
  if (selectAlternative || alternativeApplied) {
    if (original.checksum !== preservedInventoryMigration.originalChecksum)
      throw new Error(`被替代的原 migration 内容发生变化：${original.name}`);
    const missingPredecessor = migrations.find(
      (migration) => migration.name < original.name && !applied.has(migration.name),
    );
    if (missingPredecessor)
      throw new Error(`保留数据升级要求前置 migration 已全部执行：${missingPredecessor.name}`);
    if (!alternativeApplied) {
      const laterApplied = migrations.find(
        (migration) => migration.name > original.name && applied.has(migration.name),
      );
      if (laterApplied) throw new Error(`保留数据升级要求停留在原迁移之前：${laterApplied.name}`);
    }
  }

  const execution: Migration[] = [];
  const status: PlannedMigration[] = [];
  for (const migration of migrations) {
    if (migration.name === alternative.name) {
      status.push({
        name: migration.name,
        status: alternativeApplied ? 'applied' : selectAlternative ? 'pending' : 'not-required',
        alternative: original.name,
      });
      continue;
    }
    if (migration.name === original.name && alternativeApplied) {
      status.push({ name: migration.name, status: 'superseded', alternative: alternative.name });
      continue;
    }
    if (applied.has(migration.name)) {
      status.push({ name: migration.name, status: 'applied' });
      continue;
    }
    if (migration.name === original.name && selectAlternative) {
      execution.push(alternative);
      status.push({ name: migration.name, status: 'pending', alternative: alternative.name });
      continue;
    }
    execution.push(migration);
    status.push({ name: migration.name, status: 'pending' });
  }
  return { execution, status };
};
