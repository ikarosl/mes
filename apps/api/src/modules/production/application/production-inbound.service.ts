import { Injectable } from '@nestjs/common';
import type {
  InventoryBatchQuery,
  PurchaseInboundOrderItem,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionInboundRepository } from './ports/production-inbound.repository.js';

@Injectable()
export class ProductionInboundService {
  constructor(
    private readonly repository: ProductionInboundRepository,
    private readonly identity: IdentityDirectoryService,
  ) {}
  async list(query: PurchaseInboundOrderQuery) {
    const result = await this.repository.list(query);
    return { ...result, items: await this.enrichMany(result.items) };
  }
  async get(id: string) {
    return this.enrich(await this.repository.get(id));
  }
  listInventory(query: InventoryBatchQuery) {
    return this.repository.listInventory(query);
  }
  getInventory(id: string) {
    return this.repository.getInventory(id);
  }
  private async enrich(row: PurchaseInboundOrderItem) {
    return (await this.enrichMany([row]))[0]!;
  }
  private async enrichMany(rows: PurchaseInboundOrderItem[]) {
    if (rows.length === 0) return rows;
    const ids = rows
      .flatMap((row) => [row.operatorId, row.createdById, row.cancelledById])
      .filter((x): x is string => Boolean(x));
    const users = await this.identity.listUserReferencesByIds([...new Set(ids)]);
    const map = new Map(users.map((x) => [x.id, x.displayName]));
    return rows.map((row) => ({
      ...row,
      operatorName: row.operatorId ? (map.get(row.operatorId) ?? null) : null,
      createdByName: row.createdById ? (map.get(row.createdById) ?? null) : null,
      cancelledByName: row.cancelledById ? (map.get(row.cancelledById) ?? null) : null,
    }));
  }
}
