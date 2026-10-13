import { loadWorkspaceEnv } from '../../../../packages/config/src/index.js';
import { createPool, type Pool } from '../../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe } from 'vitest';
import { MysqlProductionBatchRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-batch.repository.js';
import { MysqlProductionMaterialDemandConfigurationRepository } from '../../../../apps/api/src/modules/production/infrastructure/mysql-production-material-demand-configuration.repository.js';
import { ProductionMaterialDemandService } from '../../../../apps/api/src/modules/production/application/production-material-demand.service.js';
import { MysqlProductSnapshotRepository } from '../../../../apps/api/src/modules/product/infrastructure/mysql-product-snapshot.repository.js';
import { ProductSnapshotService } from '../../../../apps/api/src/modules/product/application/product-snapshot.service.js';
import { MysqlMaterialVariantRepository } from '../../../../apps/api/src/modules/product/infrastructure/mysql-material-variant.repository.js';
import { MysqlIdempotencyExecutor } from '../../../../apps/api/src/infrastructure/idempotency/mysql-idempotency.executor.js';
import {
  createFixture,
  requiredEnv,
  type Fixture,
  type ProductionPersistenceContext,
} from './production-persistence-fixture.js';
import { registerProductionMaterialConfigurationCases } from './production-persistence-material-configuration.cases.js';
import { registerProductionTaskPersistenceCases } from './production-persistence-tasks.cases.js';
import { registerProductionPersistenceTransactionCases } from './production-persistence-transactions.cases.js';
import { registerProductionReportFactCases } from './production-persistence-report-facts.cases.js';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Production MySQL persistence', () => {
  let pool: Pool;
  let repository: MysqlProductionBatchRepository;
  let demandRepository: MysqlProductionMaterialDemandConfigurationRepository;
  let demandService: ProductionMaterialDemandService;
  let variants: MysqlMaterialVariantRepository;
  let fixture: Fixture;

  beforeAll(async () => {
    pool = createPool({
      host: requiredEnv('DB_HOST'),
      port: Number(requiredEnv('DB_PORT')),
      user: requiredEnv('DB_USER'),
      password: requiredEnv('DB_PASSWORD'),
      database: requiredEnv('DB_NAME'),
      charset: 'utf8mb4_0900_ai_ci',
      timezone: '+08:00',
      connectionLimit: 4,
    });
    repository = new MysqlProductionBatchRepository(pool);
    variants = new MysqlMaterialVariantRepository(pool);
    demandRepository = new MysqlProductionMaterialDemandConfigurationRepository(
      pool,
      new ProductSnapshotService(new MysqlProductSnapshotRepository(pool)),
      variants,
    );
    demandService = new ProductionMaterialDemandService(
      demandRepository,
      new MysqlIdempotencyExecutor(pool),
    );
    fixture = await createFixture(pool);
  });

  afterAll(async () => {
    if (pool && fixture) {
      await pool.execute('DELETE FROM operation_logs WHERE request_id=?', [fixture.requestId]);
      await pool.execute('DELETE FROM production_item_demand WHERE production_batch_id=?', [
        fixture.batchId,
      ]);
      await pool.execute(
        'DELETE FROM production_material_requirement_basis WHERE production_batch_id=?',
        [fixture.batchId],
      );
      await pool.execute(
        'DELETE FROM batch_step_abnormal_dispositions WHERE production_batch_id=?',
        [fixture.batchId],
      );
      await pool.execute(
        'DELETE FROM batch_step_reports WHERE production_batch_id=? AND (reversal_of_report_id IS NOT NULL OR replaces_report_id IS NOT NULL)',
        [fixture.batchId],
      );
      await pool.execute(
        'DELETE FROM batch_step_reports WHERE production_batch_id=? AND reversal_of_report_id IS NULL AND replaces_report_id IS NULL',
        [fixture.batchId],
      );
      await pool.execute('DELETE FROM batch_step_records WHERE production_batch_id=?', [
        fixture.batchId,
      ]);
      await pool.execute('DELETE FROM production_batches WHERE work_order_id=?', [
        fixture.workOrderId,
      ]);
      await pool.execute('DELETE FROM work_order_material_versions WHERE work_order_id=?', [
        fixture.workOrderId,
      ]);
      await pool.execute('DELETE FROM work_orders WHERE id=?', [fixture.workOrderId]);
      await pool.execute('DELETE FROM process_route_steps WHERE route_id=?', [
        fixture.processRouteId,
      ]);
      await pool.execute('DELETE FROM process_routes WHERE id=?', [fixture.processRouteId]);
      await pool.execute('DELETE FROM process_steps WHERE id=?', [fixture.processStepId]);
      await pool.execute('DELETE FROM product_materials WHERE product_id=?', [fixture.productId]);
      await pool.execute('DELETE FROM material_variants WHERE material_id=?', [fixture.materialId]);
      await pool.execute('DELETE FROM products WHERE id=?', [fixture.productId]);
      await pool.execute('DELETE FROM materials WHERE id=?', [fixture.materialId]);
      await pool.execute('DELETE FROM item_categories WHERE id IN (?,?)', [
        fixture.productCategoryId,
        fixture.materialCategoryId,
      ]);
      await pool.execute('DELETE FROM http_idempotency_records WHERE idempotency_key LIKE ?', [
        `${fixture.token}%`,
      ]);
      await pool.execute('DELETE FROM operation_logs WHERE request_id LIKE ?', [
        `${fixture.token}%`,
      ]);
      await pool.execute('DELETE FROM users WHERE id=?', [fixture.actorId]);
    }
    await pool?.end();
  });

  const getContext = (): ProductionPersistenceContext => ({
    pool,
    repository,
    demandRepository,
    demandService,
    fixture,
  });

  // Keep registration order: these cases share the same beforeAll fixture.
  registerProductionMaterialConfigurationCases(getContext);
  registerProductionTaskPersistenceCases(getContext);
  registerProductionPersistenceTransactionCases(getContext);
  registerProductionReportFactCases(getContext);
});
