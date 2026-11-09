import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { QualityInboundCommand } from './application/quality-inbound.command.js';
import { QualityInboundQuery } from './application/quality-inbound.query.js';
import { MysqlQualityInboundRepository } from './infrastructure/mysql-quality-inbound.repository.js';
import { QualityIncomingInspectionOrderCommand } from './application/quality-incoming-inspection-order.command.js';
import { MysqlIncomingInspectionOrderCommand } from './infrastructure/mysql-incoming-inspection-order.command.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: QualityIncomingInspectionOrderCommand,
      useClass: MysqlIncomingInspectionOrderCommand,
    },
    MysqlQualityInboundRepository,
    { provide: QualityInboundCommand, useExisting: MysqlQualityInboundRepository },
    { provide: QualityInboundQuery, useExisting: MysqlQualityInboundRepository },
  ],
  exports: [QualityIncomingInspectionOrderCommand, QualityInboundCommand, QualityInboundQuery],
})
export class QualityModule {}
