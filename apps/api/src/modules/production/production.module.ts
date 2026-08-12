import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdempotencyModule } from '../../infrastructure/idempotency/idempotency.module.js';
import { IdentityModule } from '../identity/public.js';
import { ProductModule } from '../product/public.js';
import { ProductionService } from './application/production.service.js';
import { ProductionMaterialService } from './application/production-material.service.js';
import { ProductionExecutionService } from './application/production-execution.service.js';
import { ProductionReportingService } from './application/production-reporting.service.js';
import { ProductionTraceService } from './application/production-trace.service.js';
import { ProductionInboundService } from './application/production-inbound.service.js';
import { ProductionAbnormalService } from './application/production-abnormal.service.js';
import { ProductionSupplementService } from './application/production-supplement.service.js';
import { ProductionRepository } from './application/ports/production.repository.js';
import { ProductionMaterialRepository } from './application/ports/production-material.repository.js';
import { ProductionExecutionRepository } from './application/ports/production-execution.repository.js';
import { ProductionReportingRepository } from './application/ports/production-reporting.repository.js';
import { ProductionTraceRepository } from './application/ports/production-trace.repository.js';
import { ProductionInboundRepository } from './application/ports/production-inbound.repository.js';
import { ProductionAbnormalRepository } from './application/ports/production-abnormal.repository.js';
import { ProductionSupplementRepository } from './application/ports/production-supplement.repository.js';
import { MysqlProductionBatchRepository } from './infrastructure/mysql-production-batch.repository.js';
import { MysqlProductionRepository } from './infrastructure/mysql-production.repository.js';
import { MysqlWorkOrderRepository } from './infrastructure/mysql-work-order.repository.js';
import { MysqlProductionMaterialRepository } from './infrastructure/mysql-production-material.repository.js';
import { MysqlProductionExecutionRepository } from './infrastructure/mysql-production-execution.repository.js';
import { MysqlProductionReportingRepository } from './infrastructure/mysql-production-reporting.repository.js';
import { MysqlProductionTraceRepository } from './infrastructure/mysql-production-trace.repository.js';
import { MysqlProductionInboundRepository } from './infrastructure/mysql-production-inbound.repository.js';
import { MysqlProductionAbnormalRepository } from './infrastructure/mysql-production-abnormal.repository.js';
import { MysqlProductionSupplementRepository } from './infrastructure/mysql-production-supplement.repository.js';
import { ProductionController } from './presentation/http/production.controller.js';
import { ProductionMaterialController } from './presentation/http/production-material.controller.js';
import { ProductionExecutionController } from './presentation/http/production-execution.controller.js';
import { ProductionReportingController } from './presentation/http/production-reporting.controller.js';
import { ProductionTraceController } from './presentation/http/production-trace.controller.js';
import { ProductionInboundController } from './presentation/http/production-inbound.controller.js';
import { ProductionAbnormalController } from './presentation/http/production-abnormal.controller.js';
import { ProductionSupplementController } from './presentation/http/production-supplement.controller.js';

@Module({
  imports: [DatabaseModule, IdentityModule, ProductModule, IdempotencyModule],
  controllers: [
    ProductionController,
    ProductionMaterialController,
    ProductionExecutionController,
    ProductionReportingController,
    ProductionTraceController,
    ProductionInboundController,
    ProductionAbnormalController,
    ProductionSupplementController,
  ],
  providers: [
    ProductionService,
    ProductionMaterialService,
    ProductionExecutionService,
    ProductionReportingService,
    ProductionTraceService,
    ProductionInboundService,
    ProductionAbnormalService,
    ProductionSupplementService,
    MysqlWorkOrderRepository,
    MysqlProductionBatchRepository,
    MysqlProductionRepository,
    MysqlProductionMaterialRepository,
    MysqlProductionExecutionRepository,
    MysqlProductionReportingRepository,
    MysqlProductionTraceRepository,
    MysqlProductionInboundRepository,
    MysqlProductionAbnormalRepository,
    MysqlProductionSupplementRepository,
    { provide: ProductionRepository, useExisting: MysqlProductionRepository },
    { provide: ProductionMaterialRepository, useExisting: MysqlProductionMaterialRepository },
    { provide: ProductionExecutionRepository, useExisting: MysqlProductionExecutionRepository },
    { provide: ProductionReportingRepository, useExisting: MysqlProductionReportingRepository },
    { provide: ProductionTraceRepository, useExisting: MysqlProductionTraceRepository },
    { provide: ProductionInboundRepository, useExisting: MysqlProductionInboundRepository },
    { provide: ProductionAbnormalRepository, useExisting: MysqlProductionAbnormalRepository },
    { provide: ProductionSupplementRepository, useExisting: MysqlProductionSupplementRepository },
  ],
})
export class ProductionModule {}
