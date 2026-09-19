import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ProductModule } from '../product/public.js';
import { IdentityModule } from '../identity/public.js';
import { InventoryStockCommand } from './application/inventory-stock.command.js';
import { InventoryInboundCommand } from './application/inventory-inbound.command.js';
import { InventoryInboundQuery } from './application/inventory-inbound.query.js';
import { InventoryInboundRepository } from './application/ports/inventory-inbound.repository.js';
import { InventoryStockCheckRepository } from './application/ports/inventory-stock-check.repository.js';
import { InventoryStockCheckService } from './application/inventory-stock-check.service.js';
import { MysqlInventoryStockCommand } from './infrastructure/mysql-inventory-stock.command.js';
import { MysqlInventoryInboundCommand } from './infrastructure/mysql-inventory-inbound.command.js';
import { MysqlInventoryInboundQuery } from './infrastructure/mysql-inventory-inbound.query.js';
import { MysqlInventoryPurchaseInboundWriter } from './infrastructure/mysql-inventory-purchase-inbound.writer.js';
import { MysqlInventoryInboundRepository } from './infrastructure/mysql-inventory-inbound.repository.js';
import { MysqlInventoryStockCheckRepository } from './infrastructure/mysql-inventory-stock-check.repository.js';
import { InventoryStockCheckController } from './presentation/http/inventory-stock-check.controller.js';

@Module({
  imports: [DatabaseModule, ProductModule, IdentityModule],
  controllers: [InventoryStockCheckController],
  providers: [
    MysqlInventoryPurchaseInboundWriter,
    InventoryStockCheckService,
    { provide: InventoryStockCommand, useClass: MysqlInventoryStockCommand },
    { provide: InventoryInboundCommand, useClass: MysqlInventoryInboundCommand },
    { provide: InventoryInboundQuery, useClass: MysqlInventoryInboundQuery },
    { provide: InventoryInboundRepository, useClass: MysqlInventoryInboundRepository },
    { provide: InventoryStockCheckRepository, useClass: MysqlInventoryStockCheckRepository },
  ],
  exports: [
    InventoryStockCommand,
    InventoryInboundCommand,
    InventoryInboundQuery,
    InventoryInboundRepository,
  ],
})
export class InventoryModule {}
