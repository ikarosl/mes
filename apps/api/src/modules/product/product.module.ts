import { Module } from '@nestjs/common';
import { loadTechnicalFileStorageConfig } from '../../config/env.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdentityModule } from '../identity/public.js';
import { ProductService } from './application/product.service.js';
import { ProcessRouteRepository } from './application/ports/process-route.repository.js';
import { ProcessStepRepository } from './application/ports/process-step.repository.js';
import { ProductCatalogRepository } from './application/ports/product-catalog.repository.js';
import { TechnicalFileRepository } from './application/ports/technical-file.repository.js';
import { TechnicalFileStorage } from './application/ports/technical-file.storage.js';
import { MysqlProcessRouteRepository } from './infrastructure/mysql-process-route.repository.js';
import { MysqlProcessStepRepository } from './infrastructure/mysql-process-step.repository.js';
import { MysqlProductCatalogRepository } from './infrastructure/mysql-product-catalog.repository.js';
import { MysqlTechnicalFileRepository } from './infrastructure/mysql-technical-file.repository.js';
import { S3TechnicalFileStorage } from './infrastructure/s3-technical-file.storage.js';
import { ProductController } from './presentation/http/product.controller.js';

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ProductController],
  providers: [
    ProductService,
    MysqlTechnicalFileRepository,
    MysqlProductCatalogRepository,
    MysqlProcessStepRepository,
    MysqlProcessRouteRepository,
    { provide: TechnicalFileRepository, useExisting: MysqlTechnicalFileRepository },
    { provide: ProductCatalogRepository, useExisting: MysqlProductCatalogRepository },
    { provide: ProcessStepRepository, useExisting: MysqlProcessStepRepository },
    { provide: ProcessRouteRepository, useExisting: MysqlProcessRouteRepository },
    {
      provide: TechnicalFileStorage,
      useFactory: () => new S3TechnicalFileStorage(loadTechnicalFileStorageConfig()),
    },
  ],
})
export class ProductModule {}
