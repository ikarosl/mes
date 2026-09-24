import { allowedPurchaseOrderClosureReasons } from '../domain/purchase-order-closure.policy.js';
import { purchaseLineClosureFacts } from './mysql-purchase-order-closure.facts.js';
import { InventoryInboundQuery } from '../../inventory/public.js';
import { QualityInboundQuery } from '../../quality/public.js';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  CreatePurchaseOrderPayload,
  UpdatePurchaseOrderPayload,
  PurchaseOrderQuery,
  PurchaseExcessReceiptCandidateQuery,
  PurchaseExcessReceiptCandidate,
  PageResult,
  RelatedPurchasesQuery,
  PurchaseOrderCommandResult,
  CreatePurchaseOrderSupplementPayload,
  ClosePurchaseOrderLinePayload,
  PurchaseOrderDraftLine,
  ProcurementDemandCandidate,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  ProductInventoryEligibility,
  type InventoryMaterialEligibility,
} from '../../product/public.js';
import { ProductionProcurementQuery } from '../../production/public.js';
import { PurchaseOrderRepository } from '../application/ports/purchase-order.repository.js';
import {
  listPurchaseOrders,
  getPurchaseOrder,
  listRelatedPurchases,
} from './queries/purchase-order.query.js';
import { listExcessReceiptCandidates } from './queries/purchase-excess-receipts.query.js';
import {
  type OrderRow,
  type OrderLineRow,
  orderError,
  readOrder,
  requireDraft,
  readLines,
  readSourceIds,
  sortedIds,
  idsSql,
} from './mysql-purchase-order.shared.js';
import {
  requireSupplier,
  requireSuppliers,
  requireSupplementEvidence,
  assertSources,
  insertOrder,
  insertLines,
  deleteDraftLines,
  closeOrderLine,
  refreshOrderCompletion,
  auditOrder,
  requireOrderWithoutReceiptFacts,
} from './mysql-purchase-order.write.js';

@Injectable()
export class MysqlPurchaseOrderRepository extends PurchaseOrderRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly production: ProductionProcurementQuery,
    private readonly product: ProductInventoryEligibility,
    private readonly inventory: InventoryInboundQuery,
    private readonly quality: QualityInboundQuery,
  ) {
    super();
  }
  list(query: PurchaseOrderQuery & { page: number; pageSize: number }) {
    return listPurchaseOrders(this.pool, query);
  }
  get(id: string) {
    return withTransaction(this.pool, (connection) => getPurchaseOrder(connection, id));
  }
  excessReceiptCandidates(
    id: string,
    query: PurchaseExcessReceiptCandidateQuery & { page: number; pageSize: number },
  ): Promise<PageResult<PurchaseExcessReceiptCandidate>> {
    return withTransaction(this.pool, (connection) =>
      listExcessReceiptCandidates(connection, id, query),
    );
  }
  related(query: RelatedPurchasesQuery & { page: number; pageSize: number }) {
    return listRelatedPurchases(this.pool, query);
  }

  create(
    payload: CreatePurchaseOrderPayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const demands = await this.requireSources(payload.items);
      assertSources(payload.items, demands, payload.workOrderId);
      await requireSuppliers(
        connection,
        payload.items.map((line) => line.supplierId),
      );
      const id = await insertOrder(connection, payload, context);
      const refs = await this.requireMaterials(payload.items);
      await insertLines(connection, id, payload.items, refs, context);
      await auditOrder(connection, context, 'purchase-order.create', id, null, payload);
      return { purchaseOrderId: id, version: 0 };
    });
  }

  update(
    id: string,
    payload: UpdatePurchaseOrderPayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const locator = await this.locate(connection, id);
      requireDraft(locator.order);
      if (!locator.order.supplement_reason)
        assertSources(payload.items, await this.requireSources(payload.items), payload.workOrderId);
      const order = await this.lockRoots(connection, id, locator.lines);
      requireDraft(order);
      requireOptimisticUpdate(
        order.version === payload.version && order.version === locator.order.version ? 1 : 0,
      );
      const lines = await readLines(connection, id, true);
      await requireSuppliers(
        connection,
        payload.items.map((line) => line.supplierId),
      );
      const sources = await readSourceIds(
        connection,
        lines.map((line) => String(line.id)),
        true,
      );
      let origin:
        | {
            lineId: string;
            evidence: string;
            receiptLineId?: string | null;
            allocationId?: string | null;
          }
        | undefined;
      if (order.supplement_reason) {
        const line = lines[0];
        const next = payload.items[0];
        if (
          !line ||
          !next ||
          lines.length !== 1 ||
          payload.items.length !== 1 ||
          (order.work_order_id === null ? null : String(order.work_order_id)) !==
            payload.workOrderId ||
          String(line.supplier_id) !== next.supplierId ||
          order.source_type !== payload.sourceType ||
          String(line.item_id) !== next.itemId ||
          String(line.material_variant_id) !== next.materialVariantId ||
          JSON.stringify(sortedIds(sources.get(String(line.id)) ?? [])) !==
            JSON.stringify(sortedIds(next.demandIds))
        )
          return orderError('补单只能调整计划量与备注，原采购、物料和需求追溯不能改变');
        origin = {
          lineId: String(line.origin_order_line_id),
          evidence: line.supplement_evidence!,
          receiptLineId:
            line.origin_receipt_line_id === null ? null : String(line.origin_receipt_line_id),
          allocationId:
            line.origin_allocation_id === null ? null : String(line.origin_allocation_id),
        };
      }
      const refs = await this.requireMaterials(payload.items);
      await deleteDraftLines(connection, lines);
      await insertLines(connection, id, payload.items, refs, context, origin);
      await connection.execute(
        'UPDATE procurement_order SET work_order_id=?,source_type=?,remark=?,version=version+1,updated_by=? WHERE id=? AND version=?',
        [
          payload.workOrderId,
          payload.sourceType,
          payload.remark ?? null,
          context.actorId,
          id,
          payload.version,
        ],
      );
      await auditOrder(
        connection,
        context,
        'purchase-order.update',
        id,
        { version: order.version },
        payload,
      );
      return { purchaseOrderId: id, version: order.version + 1 };
    });
  }

  place(id: string, version: number, context: CommandContext): Promise<PurchaseOrderCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const locator = await this.locate(connection, id);
      requireDraft(locator.order);
      const candidateLines = toDraftLines(locator.lines, locator.sources);
      if (!locator.order.supplement_reason)
        assertSources(
          candidateLines,
          await this.requireSources(candidateLines),
          locator.order.work_order_id === null ? null : String(locator.order.work_order_id),
        );
      const order = await this.lockRoots(connection, id, locator.lines);
      requireDraft(order);
      requireOptimisticUpdate(
        order.version === version && order.version === locator.order.version ? 1 : 0,
      );
      const lines = await readLines(connection, id, true);
      const sources = await readSourceIds(
        connection,
        lines.map((line) => String(line.id)),
        true,
      );
      if (
        order.work_order_id !== locator.order.work_order_id ||
        order.source_type !== locator.order.source_type ||
        JSON.stringify(toDraftLines(lines, sources)) !== JSON.stringify(candidateLines)
      )
        return orderError(
          '采购草稿来源已变化，请刷新后重新下单',
          PROCUREMENT_ERROR_CODES.procurementSourceUnavailable,
        );
      if (!lines.length) return orderError('采购单没有物料行');
      await requireSuppliers(
        connection,
        lines.map((line) => String(line.supplier_id)),
      );
      if (order.supplement_reason)
        await this.assertSupplementOrigins(connection, order, lines, sources);
      const refs = await this.requireMaterials(candidateLines);
      if (order.supplement_reason)
        for (const line of lines)
          await requireSupplementEvidence(
            connection,
            String(line.origin_order_line_id),
            order.supplement_reason,
            line.origin_receipt_line_id === null ? undefined : String(line.origin_receipt_line_id),
            line.origin_allocation_id === null ? undefined : String(line.origin_allocation_id),
          );
      const refMap = new Map(refs.map((ref) => [`${ref.itemId}:${ref.materialVariantId}`, ref]));
      for (const line of lines) {
        const ref = refMap.get(`${line.item_id}:${line.material_variant_id}`)!;
        await connection.execute(
          `UPDATE procurement_order_line SET item_code_snapshot=?,material_variant_code_snapshot=?,unit_snapshot=?,status='open',version=version+1,updated_by=? WHERE id=?`,
          [ref.itemCode, ref.materialVariantCode, ref.unit, context.actorId, line.id],
        );
      }
      await connection.execute(
        "UPDATE procurement_order SET status='ordered',ordered_by=?,ordered_at=NOW(),version=version+1,updated_by=? WHERE id=?",
        [context.actorId, context.actorId, id],
      );
      await auditOrder(
        connection,
        context,
        'purchase-order.place',
        id,
        { status: order.status, version },
        { status: 'ordered', version: version + 1, sources: candidateLines },
      );
      return { purchaseOrderId: id, version: version + 1 };
    });
  }

  cancel(
    id: string,
    version: number,
    reason: string,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const order = await this.lockRoots(connection, id, await readLines(connection, id));
      requireOptimisticUpdate(order.version === version ? 1 : 0);
      if (order.status !== 'draft' && order.status !== 'ordered')
        return orderError('仅草稿或已下单采购可以取消', PROCUREMENT_ERROR_CODES.purchaseOrderState);
      const lines = await readLines(connection, id, true);
      if (lines.some((line) => line.status === 'closed'))
        return orderError(
          '已有人工结束的采购行，请逐行处理剩余采购',
          PROCUREMENT_ERROR_CODES.purchaseOrderState,
        );
      await requireOrderWithoutReceiptFacts(connection, id);
      for (const line of lines)
        if (line.status === 'draft' || line.status === 'open')
          await closeOrderLine(connection, order, line, 'cancelled', reason, context);
      await connection.execute(
        "UPDATE procurement_order SET status='cancelled',version=version+1,updated_by=? WHERE id=?",
        [context.actorId, id],
      );
      await auditOrder(
        connection,
        context,
        'purchase-order.cancel',
        id,
        { status: order.status, version },
        { status: 'cancelled', reason, version: version + 1 },
      );
      return { purchaseOrderId: id, version: version + 1 };
    });
  }

  closeLine(
    id: string,
    payload: ClosePurchaseOrderLinePayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const orderId = await this.locateLineOrder(connection, id);
      const order = await this.lockRoots(connection, orderId, await readLines(connection, orderId));
      if (order.status !== 'ordered')
        return orderError('仅已下单采购行可以结束', PROCUREMENT_ERROR_CODES.purchaseOrderState);
      const lines = await readLines(connection, orderId, true);
      const line = lines.find((row) => String(row.id) === id);
      if (!line) return orderError('采购行不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);
      requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
      if (line.status !== 'open')
        return orderError('采购行已经结束或取消', PROCUREMENT_ERROR_CODES.purchaseOrderState);
      const facts = await purchaseLineClosureFacts(connection, id, this.quality, this.inventory);
      if (
        !allowedPurchaseOrderClosureReasons(
          Number(line.planned_quantity),
          facts.quantities,
          facts.hasReceipt,
        ).includes(payload.reasonType)
      )
        return orderError('当前到货、质检及退回事实不满足所选关闭条件', 'PURCHASE_ORDER_STATE');
      await closeOrderLine(
        connection,
        order,
        line,
        payload.reasonType,
        payload.reason,
        context,
        facts,
      );
      await refreshOrderCompletion(connection, orderId, context);
      await auditOrder(
        connection,
        context,
        'purchase-order-line.close',
        orderId,
        { lineId: id, version: line.version },
        { lineId: id, ...payload },
      );
      return { purchaseOrderId: orderId, version: order.version + 1 };
    });
  }

  supplement(
    id: string,
    payload: CreatePurchaseOrderSupplementPayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const originalId = await this.locateLineOrder(connection, id);
      const original = await readOrder(connection, originalId, true);
      if (!original.ordered_at)
        return orderError(
          '补单必须追溯已经正式下单的采购行',
          PROCUREMENT_ERROR_CODES.purchaseOrderState,
        );
      const lines = await readLines(connection, originalId, true);
      const line = lines.find((row) => String(row.id) === id);
      if (!line) return orderError('原采购行不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);
      await requireSupplier(connection, String(line.supplier_id));
      const sources = await readSourceIds(connection, [id], true);
      const draft: CreatePurchaseOrderPayload = {
        workOrderId: original.work_order_id === null ? null : String(original.work_order_id),
        sourceType: original.source_type,
        remark: payload.remark ?? null,
        items: [
          {
            supplierId: String(line.supplier_id),
            itemId: String(line.item_id),
            materialVariantId: String(line.material_variant_id),
            plannedQuantity: payload.plannedQuantity,
            demandIds: sources.get(id) ?? [],
          },
        ],
      };
      const orderId = await insertOrder(connection, draft, context, payload.supplementReason);
      const refs = await this.requireMaterials(draft.items);
      await requireSupplementEvidence(
        connection,
        id,
        payload.supplementReason,
        payload.originReceiptLineId,
        payload.originAllocationId,
      );
      await insertLines(connection, orderId, draft.items, refs, context, {
        lineId: id,
        evidence: payload.supplementEvidence,
        receiptLineId: payload.originReceiptLineId ?? null,
        allocationId: payload.originAllocationId ?? null,
      });
      await auditOrder(connection, context, 'purchase-order.supplement', orderId, null, {
        originOrderLineId: id,
        ...payload,
      });
      return { purchaseOrderId: orderId, version: 0 };
    });
  }

  private async requireSources(
    lines: PurchaseOrderDraftLine[],
  ): Promise<ProcurementDemandCandidate[]> {
    const demandIds = sortedIds(lines.flatMap((line) => line.demandIds));
    if (!demandIds.length) return [];
    const result = await this.production.requirePurchasableDemands({ demandIds });
    if (result.status !== 'success')
      return orderError(result.message, PROCUREMENT_ERROR_CODES.procurementSourceUnavailable);
    return result.value;
  }
  private async requireMaterials(
    lines: PurchaseOrderDraftLine[],
  ): Promise<InventoryMaterialEligibility[]> {
    const result = await this.product.requirePurchasableReferences({
      references: lines.map((line) => ({
        itemId: line.itemId,
        materialVariantId: line.materialVariantId,
      })),
    });
    if (result.status !== 'success')
      return orderError(result.message, PROCUREMENT_ERROR_CODES.procurementSourceUnavailable);
    return result.value;
  }
  private async locate(connection: PoolConnection, id: string) {
    const order = await readOrder(connection, id);
    const lines = await readLines(connection, id);
    const sources = await readSourceIds(
      connection,
      lines.map((line) => String(line.id)),
    );
    return { order, lines, sources };
  }
  private async locateLineOrder(connection: PoolConnection, id: string): Promise<string> {
    const [[row]] = await connection.query<(RowDataPacket & { purchase_order_id: number })[]>(
      'SELECT purchase_order_id FROM procurement_order_line WHERE id=?',
      [id],
    );
    if (!row) return orderError('采购行不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);
    return String(row.purchase_order_id);
  }
  private async lockRoots(
    connection: PoolConnection,
    id: string,
    lines: OrderLineRow[],
  ): Promise<OrderRow> {
    const origins = lines.flatMap((line) =>
      line.origin_order_line_id === null ? [] : [String(line.origin_order_line_id)],
    );
    let originalOrderIds: string[] = [];
    if (origins.length) {
      const [rows] = await connection.query<(RowDataPacket & { purchase_order_id: number })[]>(
        `SELECT purchase_order_id FROM procurement_order_line WHERE id IN (${idsSql(origins)})`,
        origins,
      );
      originalOrderIds = rows.map((row) => String(row.purchase_order_id));
    }
    let current: OrderRow | undefined;
    for (const rootId of sortedIds([id, ...originalOrderIds])) {
      const root = await readOrder(connection, rootId, true);
      if (rootId === id) current = root;
    }
    return current!;
  }
  private async assertSupplementOrigins(
    connection: PoolConnection,
    order: OrderRow,
    lines: OrderLineRow[],
    sources: Map<string, string[]>,
  ) {
    for (const line of lines) {
      if (line.origin_order_line_id === null) return orderError('补单缺少原采购行');
      const [[origin]] = await connection.query<
        (OrderLineRow & {
          work_order_id: number | null;
          source_type: string;
          ordered_at: Date | null;
        })[]
      >(
        `SELECT l.*,o.work_order_id,o.source_type,o.ordered_at FROM procurement_order_line l JOIN procurement_order o ON o.id=l.purchase_order_id WHERE l.id=? FOR SHARE`,
        [line.origin_order_line_id],
      );
      if (
        !origin ||
        !origin.ordered_at ||
        String(origin.supplier_id) !== String(line.supplier_id) ||
        origin.work_order_id !== order.work_order_id ||
        origin.source_type !== order.source_type ||
        String(origin.item_id) !== String(line.item_id) ||
        String(origin.material_variant_id) !== String(line.material_variant_id)
      )
        return orderError('补单原采购身份不一致');
      const originalSources = await readSourceIds(connection, [String(origin.id)], true);
      if (
        JSON.stringify(sortedIds(originalSources.get(String(origin.id)) ?? [])) !==
        JSON.stringify(sortedIds(sources.get(String(line.id)) ?? []))
      )
        return orderError('补单必须完整保留原采购需求追溯');
    }
  }
}
const toDraftLines = (
  lines: OrderLineRow[],
  sources: Map<string, string[]>,
): PurchaseOrderDraftLine[] =>
  lines.map((line) => ({
    supplierId: String(line.supplier_id),
    itemId: String(line.item_id),
    materialVariantId: String(line.material_variant_id),
    plannedQuantity: Number(line.planned_quantity),
    demandIds: sources.get(String(line.id)) ?? [],
  }));
