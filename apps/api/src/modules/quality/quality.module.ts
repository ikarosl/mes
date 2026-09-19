import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { QualityInboundCommand } from './application/quality-inbound.command.js';
import { QualityInboundQuery } from './application/quality-inbound.query.js';
import { MysqlQualityInboundRepository } from './infrastructure/mysql-quality-inbound.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    MysqlQualityInboundRepository,
    { provide: QualityInboundCommand, useExisting: MysqlQualityInboundRepository },
    { provide: QualityInboundQuery, useExisting: MysqlQualityInboundRepository },
  ],
  exports: [QualityInboundCommand, QualityInboundQuery],
})
export class QualityModule {}
