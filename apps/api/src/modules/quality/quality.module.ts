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

@Module({
  imports: [DatabaseModule, IdempotencyModule, IdentityModule],
  controllers: [FinishedInspectionController],
  providers: [
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
    QualityInboundCommand,
    QualityInboundQuery,
    QualityFinishedInspectionQuery,
    QualityFinishedInspectionSourceRegistry,
  ],
})
export class QualityModule {}
