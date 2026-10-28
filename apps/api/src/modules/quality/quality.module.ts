import { ProcessInspectionService } from './application/process-inspection.service.js';
import { ProcessInspectionRepository } from './application/ports/process-inspection.repository.js';
import { QualityProcessInspectionCommand } from './application/quality-process-inspection.command.js';
import { QualityProcessInspectionQuery } from './application/quality-process-inspection.query.js';
import { QualityProcessInspectionSourceRegistry } from './application/quality-process-inspection-source.registry.js';
import { MysqlProcessInspectionRepository } from './infrastructure/mysql-process-inspection.repository.js';
import { ProcessInspectionController } from './presentation/http/process-inspection.controller.js';
import { IdempotencyModule } from '../../infrastructure/idempotency/idempotency.module.js';
import { IdentityModule } from '../identity/public.js';
import { FinishedInspectionService } from './application/finished-inspection.service.js';
import { FinishedInspectionRepository } from './application/ports/finished-inspection.repository.js';
import { QualityFinishedInspectionQuery } from './application/quality-finished-inspection.query.js';
import { QualityFinishedInspectionSourceRegistry } from './application/quality-finished-inspection-source.registry.js';
import { MysqlQualityFinishedRepository } from './infrastructure/mysql-quality-finished.repository.js';
import { FinishedInspectionController } from './presentation/http/finished-inspection.controller.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { QualityInboundCommand } from './application/quality-inbound.command.js';
import { QualityInboundQuery } from './application/quality-inbound.query.js';
import { MysqlQualityInboundRepository } from './infrastructure/mysql-quality-inbound.repository.js';
import { QualityIncomingInspectionOrderCommand } from './application/quality-incoming-inspection-order.command.js';
import { MysqlIncomingInspectionOrderCommand } from './infrastructure/mysql-incoming-inspection-order.command.js';

@Module({
  imports: [DatabaseModule, IdempotencyModule, IdentityModule],
  controllers: [FinishedInspectionController, ProcessInspectionController],
  providers: [
    {
      provide: QualityIncomingInspectionOrderCommand,
      useClass: MysqlIncomingInspectionOrderCommand,
    },
    ProcessInspectionService,
    { provide: QualityProcessInspectionQuery, useExisting: ProcessInspectionService },
    QualityProcessInspectionSourceRegistry,
    MysqlProcessInspectionRepository,
    { provide: ProcessInspectionRepository, useExisting: MysqlProcessInspectionRepository },
    { provide: QualityProcessInspectionCommand, useExisting: MysqlProcessInspectionRepository },
    FinishedInspectionService,
    QualityFinishedInspectionSourceRegistry,
    MysqlQualityFinishedRepository,
    { provide: FinishedInspectionRepository, useExisting: MysqlQualityFinishedRepository },
    { provide: QualityFinishedInspectionQuery, useExisting: MysqlQualityFinishedRepository },
    MysqlQualityInboundRepository,
    { provide: QualityInboundCommand, useExisting: MysqlQualityInboundRepository },
    { provide: QualityInboundQuery, useExisting: MysqlQualityInboundRepository },
  ],
  exports: [
    QualityIncomingInspectionOrderCommand,
    QualityProcessInspectionCommand,
    QualityProcessInspectionQuery,
    QualityProcessInspectionSourceRegistry,
    QualityInboundCommand,
    QualityInboundQuery,
    QualityFinishedInspectionQuery,
    QualityFinishedInspectionSourceRegistry,
  ],
})
export class QualityModule {}
