import { Module } from '@nestjs/common';
import { loadTechnicalFileStorageConfig } from '../../config/env.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ProductService } from './application/product.service.js';
import { ProductRepository } from './application/ports/product.repository.js';
import { TechnicalFileStorage } from './application/ports/technical-file.storage.js';
import { MysqlProductRepository } from './infrastructure/mysql-product.repository.js';
import { S3TechnicalFileStorage } from './infrastructure/s3-technical-file.storage.js';
import { ProductController } from './presentation/http/product.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ProductController],
  providers: [
    ProductService,
    MysqlProductRepository,
    { provide: ProductRepository, useExisting: MysqlProductRepository },
    {
      provide: TechnicalFileStorage,
      useFactory: () => new S3TechnicalFileStorage(loadTechnicalFileStorageConfig()),
    },
  ],
})
export class ProductModule {}
