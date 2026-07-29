import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdentityModule } from '../identity/public.js';
import { ProductModule } from '../product/public.js';
import { ProductionService } from './application/production.service.js';
import { ProductionRepository } from './application/ports/production.repository.js';
import { MysqlProductionRepository } from './infrastructure/mysql-production.repository.js';
import { ProductionController } from './presentation/http/production.controller.js';

@Module({
  imports: [DatabaseModule, IdentityModule, ProductModule],
  controllers: [ProductionController],
  providers: [
    ProductionService,
    MysqlProductionRepository,
    { provide: ProductionRepository, useExisting: MysqlProductionRepository },
  ],
})
export class ProductionModule {}
