import { QualityModule } from '../quality/public.js';
import { MysqlProductionFinishedInspectionSource } from './infrastructure/mysql-production-finished-inspection-source.js';
import { InventoryModule } from '../inventory/public.js';
import { ProductionProcurementQuery } from './application/production-procurement.query.js';
import { MysqlProductionProcurementQuery } from './infrastructure/mysql-production-procurement.query.js';
import { ProductionTerminationService } from './application/production-termination.service.js';
import { ProductionTerminationRepository } from './application/ports/production-termination.repository.js';
import { MysqlProductionTerminationRepository } from './infrastructure/mysql-production-termination.repository.js';
import { ProductionTerminationController } from './presentation/http/production-termination.controller.js';
import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/public.js';
import { ProductionDemandCorrectionRepository } from './application/ports/production-demand-correction.repository.js';
import { MysqlProductionDemandCorrectionRepository } from './infrastructure/mysql-production-demand-correction.repository.js';
import { ProductionDemandCorrectionService } from './application/production-demand-correction.service.js';
import { ProductionDemandCorrectionApprovalHandler } from './application/production-demand-correction-approval.handler.js';
import { ProductionDemandCorrectionController } from './presentation/http/production-demand-correction.controller.js';
import { ProductionCloseoutRepository } from './application/ports/production-closeout.repository.js';
import { MysqlProductionCloseoutRepository } from './infrastructure/mysql-production-closeout.repository.js';
import { ProductionCloseoutService } from './application/production-closeout.service.js';
import { ProductionCloseoutApprovalHandler } from './application/production-closeout-approval.handler.js';
import { ProductionCloseoutController } from './presentation/http/production-closeout.controller.js';
import { ProductionOutputRepository } from './application/ports/production-output.repository.js';
import { ProductionOutputService } from './application/production-output.service.js';
import { MysqlProductionOutputRepository } from './infrastructure/mysql-production-output.repository.js';
import { ProductionOutputController } from './presentation/http/production-output.controller.js';
import { ProductionCloseoutMaterialLossRepository } from './application/ports/production-closeout-material-loss.repository.js';
import { ProductionCloseoutMaterialLossService } from './application/production-closeout-material-loss.service.js';
import { MysqlProductionCloseoutMaterialLossRepository } from './infrastructure/mysql-production-closeout-material-loss.repository.js';
import { ProductionCloseoutMaterialLossController } from './presentation/http/production-closeout-material-loss.controller.js';
import { ProductionFinishedInboundRepository } from './application/ports/production-finished-inbound.repository.js';
import { ProductionFinishedInboundService } from './application/production-finished-inbound.service.js';
import { MysqlProductionFinishedInboundRepository } from './infrastructure/mysql-production-finished-inbound.repository.js';
import { ProductionFinishedInboundController } from './presentation/http/production-finished-inbound.controller.js';
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
import { ProductionMaterialLossService } from './application/production-material-loss.service.js';
import { ProductionReturnService } from './application/production-return.service.js';
import { ProductionMaterialOutboundService } from './application/production-material-outbound.service.js';
import { ProductionRepository } from './application/ports/production.repository.js';
import { ProductionMaterialRepository } from './application/ports/production-material.repository.js';
import { ProductionMaterialDemandConfigurationRepository } from './application/ports/production-material-demand-configuration.repository.js';
import { ProductionExecutionRepository } from './application/ports/production-execution.repository.js';
import { ProductionReportingRepository } from './application/ports/production-reporting.repository.js';
import { ProductionTraceRepository } from './application/ports/production-trace.repository.js';
import { ProductionSupplyDemandRepository } from './application/ports/production-supply-demand.repository.js';
import { ProductionAbnormalRepository } from './application/ports/production-abnormal.repository.js';
import { ProductionSupplementRepository } from './application/ports/production-supplement.repository.js';
import { ProductionMaterialLossRepository } from './application/ports/production-material-loss.repository.js';
import { ProductionReturnRepository } from './application/ports/production-return.repository.js';
import { MysqlProductionBatchRepository } from './infrastructure/mysql-production-batch.repository.js';
import { MysqlProductionRepository } from './infrastructure/mysql-production.repository.js';
import { MysqlWorkOrderRepository } from './infrastructure/mysql-work-order.repository.js';
import { MysqlProductionMaterialRepository } from './infrastructure/mysql-production-material.repository.js';
import { MysqlProductionMaterialDemandConfigurationRepository } from './infrastructure/mysql-production-material-demand-configuration.repository.js';
import { MysqlProductionExecutionRepository } from './infrastructure/mysql-production-execution.repository.js';
import { MysqlProductionReportingRepository } from './infrastructure/mysql-production-reporting.repository.js';
import { MysqlProductionTraceRepository } from './infrastructure/mysql-production-trace.repository.js';
import { MysqlProductionSupplyDemandRepository } from './infrastructure/mysql-production-supply-demand.repository.js';
import { MysqlProductionAbnormalRepository } from './infrastructure/mysql-production-abnormal.repository.js';
import { MysqlProductionSupplementRepository } from './infrastructure/mysql-production-supplement.repository.js';
import { MysqlProductionMaterialLossRepository } from './infrastructure/mysql-production-material-loss.repository.js';
import { MysqlProductionReturnRepository } from './infrastructure/mysql-production-return.repository.js';
import { ProductionController } from './presentation/http/production.controller.js';
import { ProductionMaterialController } from './presentation/http/production-material.controller.js';
import { ProductionMaterialDemandController } from './presentation/http/production-material-demand.controller.js';
import { ProductionExecutionController } from './presentation/http/production-execution.controller.js';
import { ProductionReportingController } from './presentation/http/production-reporting.controller.js';
import { ProductionTraceController } from './presentation/http/production-trace.controller.js';
import { ProductionInboundController } from './presentation/http/production-inbound.controller.js';
import { ProductionAbnormalController } from './presentation/http/production-abnormal.controller.js';
import { ProductionSupplementController } from './presentation/http/production-supplement.controller.js';
import { ProductionMaterialLossController } from './presentation/http/production-material-loss.controller.js';
import { ProductionReturnController } from './presentation/http/production-return.controller.js';

import { ProductionMaterialOutboundRepository } from './application/ports/production-material-outbound.repository.js';
import { MysqlProductionMaterialOutboundRepository } from './infrastructure/mysql-production-material-outbound.repository.js';

// 装配按职责分组；各用例继续共享 Production 所有权及同池事务。
const planningControllers = [ProductionController];
const planningProviders = [
  ProductionService,
  MysqlWorkOrderRepository,
  MysqlProductionBatchRepository,
  MysqlProductionRepository,
  { provide: ProductionRepository, useExisting: MysqlProductionRepository },
];
const executionControllers = [
  ProductionExecutionController,
  ProductionReportingController,
  ProductionAbnormalController,
  ProductionSupplementController,
];
const executionProviders = [
  ProductionExecutionService,
  ProductionReportingService,
  ProductionAbnormalService,
  ProductionSupplementService,
  MysqlProductionExecutionRepository,
  MysqlProductionReportingRepository,
  MysqlProductionAbnormalRepository,
  MysqlProductionSupplementRepository,
  { provide: ProductionExecutionRepository, useExisting: MysqlProductionExecutionRepository },
  { provide: ProductionReportingRepository, useExisting: MysqlProductionReportingRepository },
  { provide: ProductionAbnormalRepository, useExisting: MysqlProductionAbnormalRepository },
  { provide: ProductionSupplementRepository, useExisting: MysqlProductionSupplementRepository },
];
const materialControllers = [
  ProductionMaterialController,
  ProductionMaterialDemandController,
  ProductionDemandCorrectionController,
];
const materialProviders = [
  ProductionMaterialService,
  ProductionMaterialOutboundService,
  ProductionMaterialDemandService,
  ProductionDemandCorrectionService,
  ProductionDemandCorrectionApprovalHandler,
  MysqlProductionMaterialRepository,
  MysqlProductionMaterialOutboundRepository,
  MysqlProductionMaterialDemandConfigurationRepository,
  MysqlProductionDemandCorrectionRepository,
  { provide: ProductionMaterialRepository, useExisting: MysqlProductionMaterialRepository },
  {
    provide: ProductionMaterialOutboundRepository,
    useExisting: MysqlProductionMaterialOutboundRepository,
  },
  {
    provide: ProductionMaterialDemandConfigurationRepository,
    useExisting: MysqlProductionMaterialDemandConfigurationRepository,
  },
  {
    provide: ProductionDemandCorrectionRepository,
    useExisting: MysqlProductionDemandCorrectionRepository,
  },
];
const closeoutControllers = [
  ProductionCloseoutMaterialLossController,
  ProductionCloseoutController,
  ProductionTerminationController,
  ProductionOutputController,
];
const closeoutProviders = [
  MysqlProductionFinishedInspectionSource,
  ProductionCloseoutMaterialLossService,
  MysqlProductionCloseoutMaterialLossRepository,
  {
    provide: ProductionCloseoutMaterialLossRepository,
    useExisting: MysqlProductionCloseoutMaterialLossRepository,
  },
  ProductionOutputService,
  MysqlProductionOutputRepository,
  { provide: ProductionOutputRepository, useExisting: MysqlProductionOutputRepository },
  ProductionCloseoutService,
  ProductionCloseoutApprovalHandler,
  ProductionTerminationService,
  MysqlProductionCloseoutRepository,
  MysqlProductionTerminationRepository,
  { provide: ProductionCloseoutRepository, useExisting: MysqlProductionCloseoutRepository },
  { provide: ProductionTerminationRepository, useExisting: MysqlProductionTerminationRepository },
];
const warehouseControllers = [
  ProductionFinishedInboundController,
  ProductionInboundController,
  ProductionMaterialLossController,
  ProductionReturnController,
];
const warehouseProviders = [
  ProductionFinishedInboundService,
  MysqlProductionFinishedInboundRepository,
  {
    provide: ProductionFinishedInboundRepository,
    useExisting: MysqlProductionFinishedInboundRepository,
  },
  ProductionInboundService,
  ProductionMaterialLossService,
  ProductionReturnService,
  MysqlProductionMaterialLossRepository,
  MysqlProductionReturnRepository,
  { provide: ProductionMaterialLossRepository, useExisting: MysqlProductionMaterialLossRepository },
  { provide: ProductionReturnRepository, useExisting: MysqlProductionReturnRepository },
];
const queryControllers = [ProductionTraceController];
const queryProviders = [
  MysqlProductionProcurementQuery,
  { provide: ProductionProcurementQuery, useExisting: MysqlProductionProcurementQuery },
  ProductionTraceService,
  ProductionSupplyDemandService,
  MysqlProductionTraceRepository,
  MysqlProductionSupplyDemandRepository,
  { provide: ProductionTraceRepository, useExisting: MysqlProductionTraceRepository },
  { provide: ProductionSupplyDemandRepository, useExisting: MysqlProductionSupplyDemandRepository },
];

@Module({
  imports: [
    QualityModule,
    InventoryModule,
    DatabaseModule,
    IdentityModule,
    ProductModule,
    IdempotencyModule,
    ApprovalModule,
  ],
  controllers: [
    ...planningControllers,
    ...executionControllers,
    ...materialControllers,
    ...closeoutControllers,
    ...warehouseControllers,
    ...queryControllers,
  ],
  providers: [
    ...planningProviders,
    ...executionProviders,
    ...materialProviders,
    ...closeoutProviders,
    ...warehouseProviders,
    ...queryProviders,
  ],
  exports: [ProductionProcurementQuery],
})
export class ProductionModule {}
