import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/public.js';
import { InventoryModule } from '../inventory/public.js';
import { IdentityModule } from '../identity/public.js';
import { ProductModule } from '../product/public.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdempotencyModule } from '../../infrastructure/idempotency/idempotency.module.js';
import { ProductionService } from './application/production.service.js';
import { ProductionWorkOrderOwnerService } from './application/production-work-order-owner.service.js';
import { ProductionTaskOwnerService } from './application/production-task-owner.service.js';
import { ProductionMaterialService } from './application/production-material.service.js';
import { ProductionMaterialDemandService } from './application/production-material-demand.service.js';
import { ProductionMaterialOutboundService } from './application/production-material-outbound.service.js';
import { ProductionMaterialLossService } from './application/production-material-loss.service.js';
import { ProductionReturnService } from './application/production-return.service.js';
import { ProductionInboundService } from './application/production-inbound.service.js';
import { ProductionSupplyDemandService } from './application/production-supply-demand.service.js';
import { ProductionDemandCorrectionService } from './application/production-demand-correction.service.js';
import { ProductionDemandCorrectionApprovalHandler } from './application/production-demand-correction-approval.handler.js';
import { ProductionProcurementQuery } from './application/production-procurement.query.js';
import { ProductionReservationQuery } from './application/production-reservation.query.js';
import { ProductionTrackingService } from './application/production-tracking.service.js';
import { ProductionOutputService } from './application/production-output.service.js';
import { ProductionOutputRepository } from './application/ports/production-output.repository.js';
import { MysqlProductionOutputRepository } from './infrastructure/tracking/mysql-production-output.repository.js';
import { ProductionOutputController } from './presentation/http/production-output.controller.js';
import { ProductionRepository } from './application/ports/production.repository.js';
import { ProductionMaterialRepository } from './application/ports/production-material.repository.js';
import { ProductionMaterialDemandConfigurationRepository } from './application/ports/production-material-demand-configuration.repository.js';
import { ProductionMaterialOutboundRepository } from './application/ports/production-material-outbound.repository.js';
import { ProductionMaterialLossRepository } from './application/ports/production-material-loss.repository.js';
import { ProductionReturnRepository } from './application/ports/production-return.repository.js';
import { ProductionSupplyDemandRepository } from './application/ports/production-supply-demand.repository.js';
import { ProductionDemandCorrectionRepository } from './application/ports/production-demand-correction.repository.js';
import { ProductionTrackingRepository } from './application/ports/production-tracking.repository.js';
import { MysqlWorkOrderRepository } from './infrastructure/tasks/mysql-work-order.repository.js';
import { MysqlProductionBatchRepository } from './infrastructure/tasks/mysql-production-batch.repository.js';
import { MysqlProductionRepository } from './infrastructure/tasks/mysql-production.repository.js';
import { MysqlProductionMaterialRepository } from './infrastructure/demand/mysql-production-material.repository.js';
import { MysqlProductionMaterialDemandConfigurationRepository } from './infrastructure/demand/mysql-production-material-demand-configuration.repository.js';
import { MysqlProductionMaterialOutboundRepository } from './infrastructure/logistics/mysql-production-material-outbound.repository.js';
import { MysqlProductionMaterialLossRepository } from './infrastructure/logistics/mysql-production-material-loss.repository.js';
import { MysqlProductionReturnRepository } from './infrastructure/logistics/mysql-production-return.repository.js';
import { MysqlProductionSupplyDemandRepository } from './infrastructure/queries/mysql-production-supply-demand.repository.js';
import { MysqlProductionDemandCorrectionRepository } from './infrastructure/demand/mysql-production-demand-correction.repository.js';
import { MysqlProductionReservationQuery } from './infrastructure/demand/mysql-production-reservation.query.js';
import { MysqlProductionProcurementQuery } from './infrastructure/demand/mysql-production-procurement.query.js';
import { MysqlProductionTrackingRepository } from './infrastructure/tracking/mysql-production-tracking.repository.js';
import { MysqlProductionTrackingTaskRepository } from './infrastructure/tracking/mysql-production-tracking-task.repository.js';
import { ProductionController } from './presentation/http/production.controller.js';
import { ProductionMaterialController } from './presentation/http/production-material.controller.js';
import { ProductionMaterialDemandController } from './presentation/http/production-material-demand.controller.js';
import { ProductionMaterialLossController } from './presentation/http/production-material-loss.controller.js';
import { ProductionReturnController } from './presentation/http/production-return.controller.js';
import { ProductionInboundController } from './presentation/http/production-inbound.controller.js';
import { ProductionDemandCorrectionController } from './presentation/http/production-demand-correction.controller.js';
import { ProductionTrackingController } from './presentation/http/production-tracking.controller.js';

@Module({
  imports: [
    DatabaseModule,
    IdempotencyModule,
    IdentityModule,
    ProductModule,
    InventoryModule,
    ApprovalModule,
  ],
  controllers: [
    ProductionController,
    ProductionMaterialController,
    ProductionMaterialDemandController,
    ProductionMaterialLossController,
    ProductionReturnController,
    ProductionInboundController,
    ProductionDemandCorrectionController,
    ProductionTrackingController,
    ProductionOutputController,
  ],
  providers: [
    ProductionService,
    ProductionWorkOrderOwnerService,
    ProductionTaskOwnerService,
    ProductionMaterialService,
    ProductionMaterialDemandService,
    ProductionMaterialOutboundService,
    ProductionMaterialLossService,
    ProductionReturnService,
    ProductionInboundService,
    ProductionSupplyDemandService,
    ProductionDemandCorrectionService,
    ProductionDemandCorrectionApprovalHandler,
    ProductionTrackingService,
    ProductionOutputService,
    MysqlProductionOutputRepository,
    { provide: ProductionOutputRepository, useExisting: MysqlProductionOutputRepository },
    MysqlWorkOrderRepository,
    MysqlProductionBatchRepository,
    MysqlProductionRepository,
    MysqlProductionMaterialRepository,
    MysqlProductionMaterialDemandConfigurationRepository,
    MysqlProductionMaterialOutboundRepository,
    MysqlProductionMaterialLossRepository,
    MysqlProductionReturnRepository,
    MysqlProductionSupplyDemandRepository,
    MysqlProductionDemandCorrectionRepository,
    MysqlProductionReservationQuery,
    MysqlProductionProcurementQuery,
    MysqlProductionTrackingRepository,
    MysqlProductionTrackingTaskRepository,
    { provide: ProductionRepository, useExisting: MysqlProductionRepository },
    { provide: ProductionMaterialRepository, useExisting: MysqlProductionMaterialRepository },
    {
      provide: ProductionMaterialDemandConfigurationRepository,
      useExisting: MysqlProductionMaterialDemandConfigurationRepository,
    },
    {
      provide: ProductionMaterialOutboundRepository,
      useExisting: MysqlProductionMaterialOutboundRepository,
    },
    {
      provide: ProductionMaterialLossRepository,
      useExisting: MysqlProductionMaterialLossRepository,
    },
    { provide: ProductionReturnRepository, useExisting: MysqlProductionReturnRepository },
    {
      provide: ProductionSupplyDemandRepository,
      useExisting: MysqlProductionSupplyDemandRepository,
    },
    {
      provide: ProductionDemandCorrectionRepository,
      useExisting: MysqlProductionDemandCorrectionRepository,
    },
    { provide: ProductionReservationQuery, useExisting: MysqlProductionReservationQuery },
    { provide: ProductionProcurementQuery, useExisting: MysqlProductionProcurementQuery },
    { provide: ProductionTrackingRepository, useExisting: MysqlProductionTrackingRepository },
  ],
  exports: [ProductionProcurementQuery, ProductionReservationQuery],
})
export class ProductionModule {}
