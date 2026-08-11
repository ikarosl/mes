import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdempotencyModule } from '../../infrastructure/idempotency/idempotency.module.js';
import { IdentityModule } from '../identity/public.js';
import { ProductModule } from '../product/public.js';
import { ProductionService } from './application/production.service.js';
import { ProductionMaterialService } from './application/production-material.service.js';
import { ProductionExecutionService } from './application/production-execution.service.js';
import { ProductionRepository } from './application/ports/production.repository.js';
import { ProductionMaterialRepository } from './application/ports/production-material.repository.js';
import { ProductionExecutionRepository } from './application/ports/production-execution.repository.js';
import { MysqlProductionBatchRepository } from './infrastructure/mysql-production-batch.repository.js';
import { MysqlProductionRepository } from './infrastructure/mysql-production.repository.js';
import { MysqlWorkOrderRepository } from './infrastructure/mysql-work-order.repository.js';
import { MysqlProductionMaterialRepository } from './infrastructure/mysql-production-material.repository.js';
import { MysqlProductionExecutionRepository } from './infrastructure/mysql-production-execution.repository.js';
import { ProductionController } from './presentation/http/production.controller.js';
import { ProductionMaterialController } from './presentation/http/production-material.controller.js';
import { ProductionExecutionController } from './presentation/http/production-execution.controller.js';

@Module({
  imports: [DatabaseModule, IdentityModule, ProductModule, IdempotencyModule],
  controllers: [ProductionController, ProductionMaterialController, ProductionExecutionController],
  providers: [
    ProductionService,
    ProductionMaterialService,
    ProductionExecutionService,
    MysqlWorkOrderRepository,
    MysqlProductionBatchRepository,
    MysqlProductionRepository,
    MysqlProductionMaterialRepository,
    MysqlProductionExecutionRepository,
    { provide: ProductionRepository, useExisting: MysqlProductionRepository },
    { provide: ProductionMaterialRepository, useExisting: MysqlProductionMaterialRepository },
    { provide: ProductionExecutionRepository, useExisting: MysqlProductionExecutionRepository },
  ],
})
export class ProductionModule {}
