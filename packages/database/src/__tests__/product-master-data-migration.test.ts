import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

describe('product master data migration', () => {
  it('implements only the canonical new.md product and process tables', async () => {
    const sql = await readFile(
      resolve(migrationsDir, '202607230001-product-master-data.up.sql'),
      'utf8',
    );

    for (const table of [
      'technical_files',
      'product_categories',
      'products',
      'product_materials',
      'process_steps',
      'process_routes',
      'process_route_steps',
      'route_step_materials',
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
    for (const forbidden of [
      'item_type',
      'item_info',
      'product_bom',
      'CREATE TABLE processes ',
      'material_batches',
      'batch_material_usages',
    ]) {
      expect(sql).not.toContain(forbidden);
    }
    expect(sql).toContain("CHECK (item_kind IN ('material', 'semi_finished', 'finished_product'))");
    expect(sql).toContain("CHECK (status IN ('draft', 'enabled', 'disabled', 'archived'))");
  });

  it('seeds backend-enforced product mutation permissions', async () => {
    const sql = await readFile(
      resolve(migrationsDir, '202607230001-product-master-data.up.sql'),
      'utf8',
    );
    expect(sql).toContain("'product:products:manage-bom'");
    expect(sql).toContain("'product:routes:manage-steps'");
    expect(sql).toContain("'product:processes:upload-sop'");
  });
});
