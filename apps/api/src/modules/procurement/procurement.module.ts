import { InventoryModule } from '../inventory/public.js';
import { QualityModule } from '../quality/public.js';
import { ReceiptService } from './application/receipt.service.js';
import { ProcurementReceiptRepository } from './application/ports/receipt.repository.js';
import { ProcurementReceiptQuery } from './application/ports/receipt-query.js';
import { MysqlProcurementReceiptRepository } from './infrastructure/mysql-procurement-receipt.repository.js';
import { MysqlProcurementReceiptQuery } from './infrastructure/mysql-procurement-receipt.query.js';
import {
  ProcurementReceiptController,
  ProcurementInboundInspectionController,
} from './presentation/http/receipt.controller.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { IdempotencyModule } from '../../infrastructure/idempotency/idempotency.module.js';
import { ProductModule } from '../product/public.js';
import { ProductionModule } from '../production/public.js';
import { PurchaseOrderService } from './application/purchase-order.service.js';
import { ProcurementQuery } from './application/procurement.query.js';
import { PurchaseOrderRepository } from './application/ports/purchase-order.repository.js';
import { MysqlPurchaseOrderRepository } from './infrastructure/mysql-purchase-order.repository.js';
import { PurchaseOrderController } from './presentation/http/purchase-order.controller.js';
import { SupplierRepository } from './application/ports/supplier.repository.js';
import { SupplierService } from './application/supplier.service.js';
import { MysqlSupplierRepository } from './infrastructure/mysql-supplier.repository.js';
import { SupplierController } from './presentation/http/supplier.controller.js';
import { IncomingInspectionOrderController } from './presentation/http/incoming-inspection-order.controller.js';
import { IncomingInspectionOrderService } from './application/incoming-inspection-order.service.js';
import { IncomingInspectionOrderQuery } from './application/ports/incoming-inspection-order.query.js';
import { IncomingInspectionOrderRepository } from './application/ports/incoming-inspection-order.repository.js';
import { MysqlIncomingInspectionOrderQuery } from './infrastructure/mysql-incoming-inspection-order.query.js';
import { MysqlIncomingInspectionOrderRepository } from './infrastructure/mysql-incoming-inspection-order.repository.js';

@Module({
  imports: [
    DatabaseModule,
    IdempotencyModule,
    ProductModule,
    ProductionModule,
    InventoryModule,
    QualityModule,
  ],
  controllers: [
    IncomingInspectionOrderController,
    SupplierController,
    PurchaseOrderController,
    ProcurementReceiptController,
    ProcurementInboundInspectionController,
  ],
  providers: [
    IncomingInspectionOrderService,
    { provide: IncomingInspectionOrderQuery, useClass: MysqlIncomingInspectionOrderQuery },
    {
      provide: IncomingInspectionOrderRepository,
      useClass: MysqlIncomingInspectionOrderRepository,
    },
    ProcurementQuery,
    ReceiptService,
    { provide: ProcurementReceiptRepository, useClass: MysqlProcurementReceiptRepository },
    { provide: ProcurementReceiptQuery, useClass: MysqlProcurementReceiptQuery },
    SupplierService,
    PurchaseOrderService,
    { provide: SupplierRepository, useClass: MysqlSupplierRepository },
    { provide: PurchaseOrderRepository, useClass: MysqlPurchaseOrderRepository },
  ],
  exports: [ProcurementQuery],
})
export class ProcurementModule {}
