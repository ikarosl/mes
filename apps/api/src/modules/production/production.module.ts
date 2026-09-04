import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdempotencyModule } from '../../infrastructure/idempotency/idempotency.module.js';
import { IdentityModule } from '../identity/public.js';
import { ProductModule } from '../product/public.js';
import { ProductionService } from './application/production.service.js';
import { ProductionMaterialService } from './application/production-material.service.js';
import { ProductionMaterialDemandService } from './application/production-material-demand.service.js';
import { ProductionExecutionService } from './application/production-execution.service.js';
import { ProductionReportingService } from './application/production-reporting.service.js';
import { ProductionTraceService } from './application/production-trace.service.js';
import { ProductionInboundService } from './application/production-inbound.service.js';
import { ProductionSupplyDemandService } from './application/production-supply-demand.service.js';
import { ProductionAbnormalService } from './application/production-abnormal.service.js';
import { ProductionSupplementService } from './application/production-supplement.service.js';
import { ProductionInventoryService } from './application/production-inventory.service.js';
import { ProductionRepository } from './application/ports/production.repository.js';
import { ProductionMaterialRepository } from './application/ports/production-material.repository.js';
import { ProductionMaterialDemandConfigurationRepository } from './application/ports/production-material-demand-configuration.repository.js';
import { ProductionExecutionRepository } from './application/ports/production-execution.repository.js';
import { ProductionReportingRepository } from './application/ports/production-reporting.repository.js';
import { ProductionTraceRepository } from './application/ports/production-trace.repository.js';
import { ProductionInboundRepository } from './application/ports/production-inbound.repository.js';
import { ProductionSupplyDemandRepository } from './application/ports/production-supply-demand.repository.js';
import { ProductionAbnormalRepository } from './application/ports/production-abnormal.repository.js';
import { ProductionSupplementRepository } from './application/ports/production-supplement.repository.js';
import { ProductionInventoryRepository } from './application/ports/production-inventory.repository.js';
import { MysqlProductionBatchRepository } from './infrastructure/mysql-production-batch.repository.js';
import { MysqlProductionRepository } from './infrastructure/mysql-production.repository.js';
import { MysqlWorkOrderRepository } from './infrastructure/mysql-work-order.repository.js';
import { MysqlProductionMaterialRepository } from './infrastructure/mysql-production-material.repository.js';
import { MysqlProductionMaterialDemandConfigurationRepository } from './infrastructure/mysql-production-material-demand-configuration.repository.js';
import { MysqlProductionExecutionRepository } from './infrastructure/mysql-production-execution.repository.js';
import { MysqlProductionReportingRepository } from './infrastructure/mysql-production-reporting.repository.js';
import { MysqlProductionTraceRepository } from './infrastructure/mysql-production-trace.repository.js';
import { MysqlProductionInboundRepository } from './infrastructure/mysql-production-inbound.repository.js';
import { MysqlProductionSupplyDemandRepository } from './infrastructure/mysql-production-supply-demand.repository.js';
import { MysqlProductionAbnormalRepository } from './infrastructure/mysql-production-abnormal.repository.js';
import { MysqlProductionSupplementRepository } from './infrastructure/mysql-production-supplement.repository.js';
import { MysqlProductionInventoryRepository } from './infrastructure/mysql-production-inventory.repository.js';
import { ProductionController } from './presentation/http/production.controller.js';
import { ProductionMaterialController } from './presentation/http/production-material.controller.js';
import { ProductionMaterialDemandController } from './presentation/http/production-material-demand.controller.js';
import { ProductionExecutionController } from './presentation/http/production-execution.controller.js';
import { ProductionReportingController } from './presentation/http/production-reporting.controller.js';
import { ProductionTraceController } from './presentation/http/production-trace.controller.js';
import { ProductionInboundController } from './presentation/http/production-inbound.controller.js';
import { ProductionAbnormalController } from './presentation/http/production-abnormal.controller.js';
import { ProductionSupplementController } from './presentation/http/production-supplement.controller.js';
import { WarehouseController } from './presentation/http/warehouse.controller.js';

@Module({
  imports: [DatabaseModule, IdentityModule, ProductModule, IdempotencyModule],
  controllers: [
    ProductionController,
    ProductionMaterialController,
    ProductionMaterialDemandController,
    ProductionExecutionController,
    ProductionReportingController,
    ProductionTraceController,
    ProductionInboundController,
    ProductionAbnormalController,
    ProductionSupplementController,
    WarehouseController,
  ],
  providers: [
    ProductionService,
    ProductionMaterialService,
    ProductionMaterialDemandService,
    ProductionExecutionService,
    ProductionReportingService,
    ProductionTraceService,
    ProductionInboundService,
    ProductionSupplyDemandService,
    ProductionAbnormalService,
    ProductionSupplementService,
    ProductionInventoryService,
    MysqlWorkOrderRepository,
    MysqlProductionBatchRepository,
    MysqlProductionRepository,
    MysqlProductionMaterialRepository,
    MysqlProductionMaterialDemandConfigurationRepository,
    MysqlProductionExecutionRepository,
    MysqlProductionReportingRepository,
    MysqlProductionTraceRepository,
    MysqlProductionInboundRepository,
    MysqlProductionSupplyDemandRepository,
    MysqlProductionAbnormalRepository,
    MysqlProductionSupplementRepository,
    MysqlProductionInventoryRepository,
    { provide: ProductionRepository, useExisting: MysqlProductionRepository },
    { provide: ProductionMaterialRepository, useExisting: MysqlProductionMaterialRepository },
    {
      provide: ProductionMaterialDemandConfigurationRepository,
      useExisting: MysqlProductionMaterialDemandConfigurationRepository,
    },
    { provide: ProductionExecutionRepository, useExisting: MysqlProductionExecutionRepository },
    { provide: ProductionReportingRepository, useExisting: MysqlProductionReportingRepository },
    { provide: ProductionTraceRepository, useExisting: MysqlProductionTraceRepository },
    { provide: ProductionInboundRepository, useExisting: MysqlProductionInboundRepository },
    {
      provide: ProductionSupplyDemandRepository,
      useExisting: MysqlProductionSupplyDemandRepository,
    },
    { provide: ProductionAbnormalRepository, useExisting: MysqlProductionAbnormalRepository },
    { provide: ProductionSupplementRepository, useExisting: MysqlProductionSupplementRepository },
    { provide: ProductionInventoryRepository, useExisting: MysqlProductionInventoryRepository },
  ],
})
export class ProductionModule {}
