import { Global, Injectable, Module } from '@nestjs/common';
import { ProductionModule, ProductionReservationQuery } from '../../modules/production/public.js';
import { InventoryReservationReadPort } from '../../modules/inventory/public.js';

@Injectable()
class ProductionInventoryReservations extends InventoryReservationReadPort {
  constructor(private readonly query: ProductionReservationQuery) {
    super();
  }
  currentAllocations(batchIds: string[]) {
    return this.query.currentAllocations(batchIds);
  }
}

/** 组合根装配窄预留读取端口；Inventory 不导入 Production 内部代码。 */
@Global()
@Module({
  imports: [ProductionModule],
  providers: [{ provide: InventoryReservationReadPort, useClass: ProductionInventoryReservations }],
  exports: [InventoryReservationReadPort],
})
export class InventoryReservationsModule {}
