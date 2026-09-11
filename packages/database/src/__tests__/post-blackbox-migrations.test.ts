import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const migration = (name: string, direction: 'up' | 'down') =>
  readFile(resolve(migrationsDir, `${name}.${direction}.sql`), 'utf8');

describe('post-blackbox schema migrations', () => {
  it('splits base materials from finished products and makes routes independent', async () => {
    const [up, down] = await Promise.all([
      migration('202609070001-split-product-material-and-routes', 'up'),
      migration('202609070001-split-product-material-and-routes', 'down'),
    ]);

    expect(up).toContain('CREATE TABLE materials');
    expect(up).toContain('RENAME COLUMN material_product_id TO material_id');
    expect(up).toContain('ALTER TABLE process_routes');
    expect(up).toContain('DROP COLUMN product_id');
    expect(down).toContain('RENAME COLUMN material_id TO material_product_id');
    expect(down).toContain('DROP TABLE materials');
  });

  it('adds immutable work-order material choices and restores the prior work-order shape', async () => {
    const [up, down] = await Promise.all([
      migration('202609070002-work-order-material-version-policy', 'up'),
      migration('202609070002-work-order-material-version-policy', 'down'),
    ]);

    expect(up).toContain('ADD COLUMN order_type VARCHAR(30) NOT NULL');
    expect(up).toContain('CREATE TABLE work_order_material_versions');
    expect(up).toContain('BEFORE UPDATE ON work_order_material_versions');
    expect(up).toContain('BEFORE DELETE ON work_order_material_versions');
    expect(down).toContain('DROP TABLE work_order_material_versions');
    expect(down).toContain('DROP COLUMN order_type');
  });

  it('moves manual additions to the production-batch level with a paired rollback', async () => {
    const [up, down] = await Promise.all([
      migration('202609070004-task-level-manual-material-demand', 'up'),
      migration('202609070004-task-level-manual-material-demand', 'down'),
    ]);

    expect(up).toContain('DROP COLUMN parent_demand_id');
    expect(up).toContain('uk_production_manual_demand_addition_batch');
    expect(up).toContain('/api/production/batches/:batchId/material-demands/additions');
    expect(down).toContain('ADD COLUMN parent_demand_id BIGINT UNSIGNED NOT NULL');
    expect(down).toContain('uk_production_manual_demand_addition_reference');
  });

  it('applies signed ledger deltas only after the variant-balance row exists', async () => {
    const [up, down] = await Promise.all([
      migration('202609070006-fix-negative-variant-balance-delta', 'up'),
      migration('202609070006-fix-negative-variant-balance-delta', 'down'),
    ]);

    expect(up).toContain('current_quantity\n  ) VALUES');
    expect(up).toContain('current_batch_status,\n    0');
    expect(up).toContain('current_quantity = current_quantity + CAST(NEW.quantity AS SIGNED)');
    expect(down).toContain('current_batch_status,\n    CAST(NEW.quantity AS SIGNED)');
  });

  it('removes only the cross-version item balance and can rebuild it on rollback', async () => {
    const [up, down] = await Promise.all([
      migration('202609080001-remove-item-balance-projection', 'up'),
      migration('202609080001-remove-item-balance-projection', 'down'),
    ]);

    expect(up).toContain('DROP TABLE inventory_item_balance');
    expect(up).toContain('trg_inventory_transaction_update_balances');
    expect(down).toContain('CREATE TABLE inventory_item_balance');
    expect(down).toContain('INSERT INTO inventory_item_balance');
  });

  it('removes material-name snapshots and fails rollback when names cannot be reconstructed', async () => {
    const [up, down] = await Promise.all([
      migration('202609080002-current-material-display-names', 'up'),
      migration('202609080002-current-material-display-names', 'down'),
    ]);

    expect(up).toContain('DROP COLUMN material_name_snapshot');
    expect(up).toContain('DROP COLUMN item_name_snapshot');
    expect(up).toContain('DROP COLUMN product_name_snapshot');
    expect(down).toContain('tmp_material_name_rollback_guard');
    expect(down).toContain(
      'SELECT 1 WHERE EXISTS (SELECT 1 FROM production_material_requirement_basis)',
    );
  });

  it('requires reporting for every route step and removes the obsolete completion permission', async () => {
    const [up, down] = await Promise.all([
      migration('202609080003-require-reporting-for-all-steps', 'up'),
      migration('202609080003-require-reporting-for-all-steps', 'down'),
    ]);

    expect(up).toContain('DROP COLUMN need_record');
    expect(up).toContain('DROP COLUMN need_record_snapshot');
    expect(up).toContain("DELETE FROM permissions WHERE code = 'production:steps:complete'");
    expect(down).toContain('ADD COLUMN need_record TINYINT NOT NULL DEFAULT 1');
    expect(down).toContain('ADD COLUMN need_record_snapshot TINYINT NOT NULL DEFAULT 1');
  });

  it('pins variant-balance trigger variables to the schema collation with a paired rollback', async () => {
    const [up, down] = await Promise.all([
      migration('202609090001-fix-variant-balance-trigger-collation', 'up'),
      migration('202609090001-fix-variant-balance-trigger-collation', 'down'),
    ]);

    expect(up.match(/CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci/g)).toHaveLength(2);
    expect(up).toContain('CREATE TRIGGER trg_inventory_transaction_update_variant_balance');
    expect(up).toContain('CREATE TRIGGER trg_inventory_transaction_cleanup_variant_balance');
    expect(down).not.toContain('COLLATE utf8mb4_0900_ai_ci');
  });

  it('removes BOM trace flags while retaining the owning status and deletion constraints', async () => {
    const [up, down] = await Promise.all([
      migration('202609110001-remove-bom-trace-flags', 'up'),
      migration('202609110001-remove-bom-trace-flags', 'down'),
    ]);

    expect(up).toContain('DROP COLUMN is_key_material');
    expect(up).toContain('DROP COLUMN need_batch_record');
    expect(up).toContain('DROP COLUMN is_key_material_snapshot');
    expect(up).toContain('DROP COLUMN need_batch_record_snapshot');
    expect(up).toContain('CHECK (status IN (0, 1) AND is_deleted IN (0, 1))');
    expect(down).toContain('ADD COLUMN is_key_material TINYINT NOT NULL DEFAULT 1');
    expect(down).toContain('ADD COLUMN need_batch_record TINYINT NOT NULL DEFAULT 1');
    expect(down).toContain('ADD COLUMN is_key_material_snapshot TINYINT NOT NULL');
    expect(down).toContain('ADD COLUMN need_batch_record_snapshot TINYINT NOT NULL');
  });
});
