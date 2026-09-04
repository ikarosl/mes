import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const readMigration = (name: string) => readFile(resolve(migrationsDir, name), 'utf8');

describe('material variant migrations', () => {
  it('makes the base material the only BOM identity and preserves semi-finished as a category', async () => {
    const [up, down] = await Promise.all([
      readMigration('202609040001-material-variant-foundation.up.sql'),
      readMigration('202609040001-material-variant-foundation.down.sql'),
    ]);

    expect(up).toContain("SET item_kind = 'material'");
    expect(up).toContain("CHECK (item_kind IN ('material', 'finished_product'))");
    expect(up).toContain('CREATE TABLE material_variants');
    expect(up).toContain('UNIQUE KEY uk_material_variants_code');
    expect(up).toContain('UNIQUE KEY uk_material_variants_version');
    expect(up).toContain('trg_products_reject_item_code_update');
    expect(up).toContain('trg_material_variants_reject_identity_update');
    expect(up).toContain('DROP TABLE route_step_materials');
    expect(up).toContain('DROP COLUMN material_end_step_record_id');

    // The rollback is intentionally data-guarded and restores the legacy route
    // linkage only after all exact-version rows have been removed.
    expect(down).toContain('tmp_material_variant_foundation_down_guard');
    expect(down.indexOf('INSERT INTO tmp_material_variant_foundation_down_guard')).toBeLessThan(
      down.indexOf('DROP TABLE material_variants'),
    );
    expect(down).toContain('CREATE TABLE route_step_materials');
    expect(down).toContain(
      "CHECK (item_kind IN ('material', 'semi_finished', 'finished_product'))",
    );
  });

  it('adds exact variant identity to demand and every material fact without a legacy backfill', async () => {
    const [up, down] = await Promise.all([
      readMigration('202609040002-production-material-variant-demand.up.sql'),
      readMigration('202609040002-production-material-variant-demand.down.sql'),
    ]);

    expect(up).toContain('CREATE TABLE production_material_requirement_basis');
    expect(up).toContain('ADD COLUMN requirement_basis_id BIGINT UNSIGNED NOT NULL');
    expect(up).toContain('ADD COLUMN material_variant_id BIGINT UNSIGNED NOT NULL');
    for (const table of [
      'item_batch',
      'production_item_allocation',
      'outbound_detail',
      'inbound_detail',
      'return_detail',
      'item_scrap',
      'stock_check_detail',
      'production_short_batch_authorization_detail',
      'production_scrap_supplement_plan_line',
      'inventory_transaction',
    ]) {
      expect(up).toContain(`ALTER TABLE ${table}`);
      expect(up).toMatch(new RegExp(`ALTER TABLE ${table}[\\s\\S]*?material_variant_id`));
    }
    expect(up).toContain('CREATE TABLE production_manual_demand_addition');
    expect(up).toContain('CREATE TABLE inventory_material_variant_balance');
    expect(up).toContain('trg_inventory_transaction_update_variant_balance');
    expect(up).toContain('trg_inventory_transaction_cleanup_variant_balance');
    expect(up).toContain('trg_item_batch_move_variant_balance');
    expect(up).not.toMatch(/UPDATE\s+production_item_demand/i);
    expect(up).not.toMatch(/UPDATE\s+item_batch/i);

    expect(down).toContain('tmp_material_variant_demand_down_guard');
    expect(down).toContain('DROP TABLE inventory_material_variant_balance');
    expect(down).toContain('DROP TABLE production_manual_demand_addition');
    expect(down).toContain('DROP TABLE production_material_requirement_basis');
    expect(down.indexOf('INSERT INTO tmp_material_variant_demand_down_guard')).toBeLessThan(
      down.indexOf('DROP TABLE inventory_material_variant_balance'),
    );
  });
});
