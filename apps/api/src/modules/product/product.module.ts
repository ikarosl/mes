import { Module } from '@nestjs/common';
import { loadTechnicalFileStorageConfig } from '../../config/env.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdentityModule } from '../identity/public.js';
import { ApprovalModule } from '../approval/public.js';
import { ProductService } from './application/product.service.js';
import { ProductInventoryEligibility } from './application/product-inventory-eligibility.query.js';
import { MysqlProductInventoryEligibility } from './infrastructure/mysql-product-inventory-eligibility.query.js';
import { ProductSnapshotQuery } from './application/product-snapshot.query.js';
import { ProductSnapshotService } from './application/product-snapshot.service.js';
import { ProductProductionDefinitionCommand } from './application/product-production-definition.command.js';
import { ProductProductionDefinitionService } from './application/product-production-definition.service.js';
import { TechnicalFileContentQuery } from './application/technical-file-content.query.js';
import { ProductSnapshotRepository } from './application/ports/product-snapshot.repository.js';
import { ProductProductionDefinitionRepository } from './application/ports/product-production-definition.repository.js';
import { ProcessRouteRepository } from './application/ports/process-route.repository.js';
import { ProcessRouteStepRepository } from './application/ports/process-route-step.repository.js';
import { ProcessStepRepository } from './application/ports/process-step.repository.js';
import { ProductCatalogRepository } from './application/ports/product-catalog.repository.js';
import { ProductCategoryRepository } from './application/ports/product-category.repository.js';
import {
  MaterialVariantQuery,
  MaterialVariantRepository,
} from './application/ports/material-variant.repository.js';
import { TechnicalFileRepository } from './application/ports/technical-file.repository.js';
import { TechnicalFileStorage } from './application/ports/technical-file.storage.js';
import { MysqlProcessRouteRepository } from './infrastructure/mysql-process-route.repository.js';
import { MysqlProcessRouteStepRepository } from './infrastructure/mysql-process-route-step.repository.js';
import { MysqlProcessStepRepository } from './infrastructure/mysql-process-step.repository.js';
import { MysqlProductCatalogRepository } from './infrastructure/mysql-product-catalog.repository.js';
import { MysqlProductCategoryRepository } from './infrastructure/mysql-product-category.repository.js';
import { MysqlMaterialVariantRepository } from './infrastructure/mysql-material-variant.repository.js';
import { MaterialRepository } from './application/ports/material.repository.js';
import { MysqlMaterialRepository } from './infrastructure/mysql-material.repository.js';
import { MysqlTechnicalFileRepository } from './infrastructure/mysql-technical-file.repository.js';
import { MysqlProductSnapshotRepository } from './infrastructure/mysql-product-snapshot.repository.js';
import { S3TechnicalFileStorage } from './infrastructure/s3-technical-file.storage.js';
import { ProductController } from './presentation/http/product.controller.js';
import { ProductBomApprovalHandler } from './application/product-bom-approval.handler.js';

@Module({
  imports: [DatabaseModule, IdentityModule, ApprovalModule],
  controllers: [ProductController],
  providers: [
    ProductService,
    MysqlProductInventoryEligibility,
    { provide: ProductInventoryEligibility, useExisting: MysqlProductInventoryEligibility },
    ProductBomApprovalHandler,
    ProductSnapshotService,
    ProductProductionDefinitionService,
    TechnicalFileContentQuery,
    MysqlProductSnapshotRepository,
    MysqlTechnicalFileRepository,
    MysqlProductCatalogRepository,
    MysqlProductCategoryRepository,
    MysqlMaterialVariantRepository,
    MysqlMaterialRepository,
    MysqlProcessStepRepository,
    MysqlProcessRouteRepository,
    MysqlProcessRouteStepRepository,
    { provide: TechnicalFileRepository, useExisting: MysqlTechnicalFileRepository },
    { provide: ProductCatalogRepository, useExisting: MysqlProductCatalogRepository },
    { provide: ProductCategoryRepository, useExisting: MysqlProductCategoryRepository },
    { provide: MaterialVariantRepository, useExisting: MysqlMaterialVariantRepository },
    { provide: MaterialVariantQuery, useExisting: MysqlMaterialVariantRepository },
    { provide: MaterialRepository, useExisting: MysqlMaterialRepository },
    { provide: ProcessStepRepository, useExisting: MysqlProcessStepRepository },
    { provide: ProcessRouteRepository, useExisting: MysqlProcessRouteRepository },
    { provide: ProcessRouteStepRepository, useExisting: MysqlProcessRouteStepRepository },
    { provide: ProductSnapshotRepository, useExisting: MysqlProductSnapshotRepository },
    {
      provide: ProductProductionDefinitionRepository,
      useExisting: MysqlProductSnapshotRepository,
    },
    { provide: ProductSnapshotQuery, useExisting: ProductSnapshotService },
    {
      provide: ProductProductionDefinitionCommand,
      useExisting: ProductProductionDefinitionService,
    },
    {
      provide: TechnicalFileStorage,
      useFactory: () => new S3TechnicalFileStorage(loadTechnicalFileStorageConfig()),
    },
  ],
  exports: [
    ProductInventoryEligibility,
    ProductSnapshotQuery,
    ProductProductionDefinitionCommand,
    TechnicalFileContentQuery,
    MaterialVariantQuery,
  ],
})
export class ProductModule {}
