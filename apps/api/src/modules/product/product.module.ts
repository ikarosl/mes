import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ProductService } from './application/product.service.js';
import { ProductRepository } from './application/ports/product.repository.js';
import { TechnicalFileStorage } from './application/ports/technical-file.storage.js';
import { LocalTechnicalFileStorage } from './infrastructure/local-technical-file.storage.js';
import { MysqlProductRepository } from './infrastructure/mysql-product.repository.js';
import { ProductController } from './presentation/http/product.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ProductController],
  providers: [
    ProductService,
    MysqlProductRepository,
    LocalTechnicalFileStorage,
    { provide: ProductRepository, useExisting: MysqlProductRepository },
    { provide: TechnicalFileStorage, useExisting: LocalTechnicalFileStorage },
  ],
})
export class ProductModule {}
