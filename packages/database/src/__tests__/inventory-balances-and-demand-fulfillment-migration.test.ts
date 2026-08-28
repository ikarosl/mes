import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationsDir } from '../migration-utils.js';

const readMigration = (direction: 'up' | 'down') =>
  readFile(
    resolve(
      migrationsDir,
      '202608250002-inventory-balances-and-demand-fulfillment.' + direction + '.sql',
    ),
    'utf8',
  );

describe('inventory balances and demand fulfillment migration', () => {
  it('adds rebuildable balances and terminal demand facts', async () => {
    const sql = await readMigration('up');

    expect(sql).toContain('ADD COLUMN remaining_number BIGINT');
    expect(sql).toContain('ADD COLUMN item_code_snapshot VARCHAR(100)');
    expect(sql).toContain("business_status IN ('active','fulfilled','cancelled')");
    expect(sql).toContain('CREATE TABLE inventory_batch_balance');
    expect(sql).toContain('CREATE TABLE inventory_item_balance');
    expect(sql.match(/current_quantity BIGINT NOT NULL/g)).toHaveLength(2);
    expect(sql).toContain('FROM inventory_transaction');
    expect(sql).toContain('CREATE TRIGGER trg_inventory_transaction_update_balances');
    expect(sql).toContain('CREATE TRIGGER trg_item_batch_move_item_balance');
  });

  it('removes projections and restores the prior demand status constraint', async () => {
    const sql = await readMigration('down');

    expect(sql).toContain('DROP TABLE inventory_item_balance');
    expect(sql).toContain('DROP TABLE inventory_batch_balance');
    expect(sql).toContain('DROP COLUMN remaining_number');
    expect(sql).toContain('DROP COLUMN item_code_snapshot');
    expect(sql).toContain("business_status IN ('active','cancelled')");
  });
});
