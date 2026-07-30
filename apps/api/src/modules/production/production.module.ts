import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdentityModule } from '../identity/public.js';
import { ProductModule } from '../product/public.js';
import { ProductionService } from './application/production.service.js';
import { ProductionRepository } from './application/ports/production.repository.js';
import { MysqlProductionBatchRepository } from './infrastructure/mysql-production-batch.repository.js';
import { MysqlProductionRepository } from './infrastructure/mysql-production.repository.js';
import { MysqlWorkOrderRepository } from './infrastructure/mysql-work-order.repository.js';
import { ProductionController } from './presentation/http/production.controller.js';

@Module({
  imports: [DatabaseModule, IdentityModule, ProductModule],
  controllers: [ProductionController],
  providers: [
    ProductionService,
    MysqlWorkOrderRepository,
    MysqlProductionBatchRepository,
    MysqlProductionRepository,
    { provide: ProductionRepository, useExisting: MysqlProductionRepository },
  ],
})
export class ProductionModule {}
