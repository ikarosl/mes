import type { Pool, RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';

const IMMUTABLE_FIXTURE_CLEANUP_TARGETS = {
  materialBasis: {
    trigger: 'trg_requirement_basis_immutable_delete',
    table: 'production_material_requirement_basis',
  },
  stepExecutionActions: {
    trigger: 'trg_step_execution_action_no_delete',
    table: 'batch_step_execution_actions',
  },
  materialLosses: {
    trigger: 'trg_closeout_material_loss_no_delete',
    table: 'item_scrap',
  },
} as const;

type DatabaseRow = RowDataPacket & { database_name: string | null };
type TriggerRow = RowDataPacket & {
  'Create Trigger'?: string;
  'SQL Original Statement'?: string;
};
type TriggerCountRow = RowDataPacket & { trigger_count: number };

/**
 * Remove a fixture's immutable BOM snapshot after its assertions have run.
 * This test-only escape hatch is restricted to the explicitly selected *_test database.
 */
export const deleteFixtureMaterialBasis = async (pool: Pool, productionBatchId: number) => {
  await deleteFixtureRows(pool, productionBatchId, IMMUTABLE_FIXTURE_CLEANUP_TARGETS.materialBasis);
};

export const deleteFixtureStepExecutionActions = async (pool: Pool, productionBatchId: number) => {
  await deleteFixtureRows(
    pool,
    productionBatchId,
    IMMUTABLE_FIXTURE_CLEANUP_TARGETS.stepExecutionActions,
  );
};

export const deleteFixtureMaterialLosses = async (pool: Pool, productionBatchId: number) => {
  await deleteFixtureRows(
    pool,
    productionBatchId,
    IMMUTABLE_FIXTURE_CLEANUP_TARGETS.materialLosses,
  );
};

const deleteFixtureRows = async (
  pool: Pool,
  productionBatchId: number,
  target: (typeof IMMUTABLE_FIXTURE_CLEANUP_TARGETS)[keyof typeof IMMUTABLE_FIXTURE_CLEANUP_TARGETS],
) => {
  assertDedicatedTestDatabaseEnvironment();
  const connection = await pool.getConnection();
  let createTriggerSql: string | undefined;
  let triggerDropAttempted = false;
  let failure: unknown;

  try {
    const [[database]] = await connection.query<DatabaseRow[]>(
      'SELECT DATABASE() AS database_name',
    );
    if (database?.database_name !== process.env.TEST_DB_NAME) {
      throw new Error('Refusing immutable material basis cleanup outside TEST_DB_NAME');
    }

    const [triggers] = await connection.query<TriggerRow[]>(
      `SHOW CREATE TRIGGER ${quoteIdentifier(target.trigger)}`,
    );
    createTriggerSql = triggers[0]?.['SQL Original Statement'] ?? triggers[0]?.['Create Trigger'];
    if (
      !createTriggerSql ||
      !createTriggerSql.includes(target.trigger) ||
      !/BEFORE\s+DELETE/i.test(createTriggerSql) ||
      !createTriggerSql.includes(target.table)
    ) {
      throw new Error(
        `The expected immutable fixture cleanup trigger is unavailable: ${target.trigger}`,
      );
    }

    triggerDropAttempted = true;
    await connection.query(`DROP TRIGGER ${quoteIdentifier(target.trigger)}`);
    await connection.execute(
      `DELETE FROM ${quoteIdentifier(target.table)} WHERE production_batch_id=?`,
      [productionBatchId],
    );
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (triggerDropAttempted && createTriggerSql) {
        const [[trigger]] = await connection.query<TriggerCountRow[]>(
          `SELECT COUNT(*) AS trigger_count
             FROM information_schema.TRIGGERS
            WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?`,
          [target.trigger],
        );
        if (Number(trigger?.trigger_count ?? 0) === 0) await connection.query(createTriggerSql);
      }
    } catch (restoreError) {
      failure = failure
        ? new AggregateError(
            [failure, restoreError],
            'Could not clean the fixture or restore the immutable material basis trigger',
          )
        : restoreError;
    } finally {
      connection.release();
    }
  }

  if (failure) throw failure;
};

const assertDedicatedTestDatabaseEnvironment = () => {
  const { DB_HOST, DB_PORT, DB_NAME, TEST_DB_HOST, TEST_DB_PORT, TEST_DB_NAME } = process.env;
  if (
    process.env.RUN_MYSQL_INTEGRATION !== '1' ||
    !TEST_DB_NAME ||
    !/_test$/.test(TEST_DB_NAME) ||
    DB_NAME !== TEST_DB_NAME ||
    !TEST_DB_HOST ||
    DB_HOST !== TEST_DB_HOST ||
    !/^\d+$/.test(TEST_DB_PORT ?? '') ||
    DB_PORT !== TEST_DB_PORT
  ) {
    throw new Error('Refusing immutable material basis cleanup without a matching *_test target');
  }
};

const quoteIdentifier = (value: string) => `\`${value.replaceAll('`', '``')}\``;
