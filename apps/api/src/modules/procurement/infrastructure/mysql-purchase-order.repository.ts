import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import { PROCUREMENT_ERROR_CODES } from '@company/constants';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreatePurchaseOrderPayload,
  UpdatePurchaseOrderPayload,
  PurchaseOrderQuery,
  PurchaseOrderLineReceiptRecordQuery,
  PurchaseOrderLineReceiptRecordPage,
  PurchaseExcessReceiptCandidateQuery,
  PurchaseExcessReceiptCandidate,
  PurchaseQualityReplacementCandidateQuery,
  PurchaseQualityReplacementCandidate,
  PageResult,
  RelatedPurchasesQuery,
  PurchaseOrderCommandResult,
  CreatePurchaseOrderSupplementPayload,
  ClosePurchaseOrderLinePayload,
  ReopenPurchaseOrderLinePayload,
  ClosePurchaseOrderPayload,
  PurchaseOrderDraftLine,
  PurchaseFulfillmentMode,
  ProcurementDemandCandidate,
  CorrectPurchaseOrderAmountsPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { requireOptimisticUpdate } from '../../../common/persistence/optimistic-lock.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  ProductInventoryEligibility,
  type InventoryMaterialEligibility,
} from '../../product/public.js';
import { ProductionProcurementQuery } from '../../production/public.js';
import { InventoryInboundQuery } from '../../inventory/public.js';
import { PurchaseOrderRepository } from '../application/ports/purchase-order.repository.js';
import {
  normalizePurchaseDraft,
  normalizePurchaseLineAmount,
} from '../domain/purchase-order.policy.js';
import {
  listPurchaseOrders,
  getPurchaseOrder,
  listRelatedPurchases,
} from './queries/purchase-order.query.js';
import { listExcessReceiptCandidates } from './queries/purchase-excess-receipts.query.js';
import { listPurchaseLineReceiptRecords } from './queries/purchase-line-receipt-records.query.js';
import { listQualityReplacementCandidates } from './queries/purchase-quality-replacements.query.js';
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
  assertSources,
  insertOrder,
  insertLines,
  deleteDraftLines,
  changeOrderLineStatus,
  refreshOrderCompletion,
  auditOrder,
  requireOrderWithoutReceiptFacts,
} from './mysql-purchase-order.write.js';
import { correctPurchaseOrderAmounts } from './mysql-purchase-order-amounts.operation.js';
import {
  requireSupplementIdentity,
  requireSupplementCreationEligibility,
} from './mysql-purchase-order-supplement.shared.js';

@Injectable()
export class MysqlPurchaseOrderRepository extends PurchaseOrderRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly production: ProductionProcurementQuery,
    private readonly product: ProductInventoryEligibility,
    private readonly inventory: InventoryInboundQuery,
  ) {
    super();
  }
  list(query: PurchaseOrderQuery & { page: number; pageSize: number }) {
    return listPurchaseOrders(this.pool, query);
  }
  get(id: string) {
    return withTransaction(this.pool, (connection) => getPurchaseOrder(connection, id));
  }
  receiptRecords(
    id: string,
    query: PurchaseOrderLineReceiptRecordQuery & { page: number; pageSize: number },
  ): Promise<PurchaseOrderLineReceiptRecordPage> {
    return withTransaction(this.pool, (connection) =>
      listPurchaseLineReceiptRecords(connection, id, query),
    );
  }
  excessReceiptCandidates(
    id: string,
    query: PurchaseExcessReceiptCandidateQuery & { page: number; pageSize: number },
  ): Promise<PageResult<PurchaseExcessReceiptCandidate>> {
    return withTransaction(this.pool, (connection) =>
      listExcessReceiptCandidates(connection, id, query),
    );
  }
  qualityReplacementCandidates(
    id: string,
    query: PurchaseQualityReplacementCandidateQuery & { page: number; pageSize: number },
  ): Promise<PageResult<PurchaseQualityReplacementCandidate>> {
    return withTransaction(this.pool, (connection) =>
      listQualityReplacementCandidates(connection, id, query),
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
      await requireSupplier(connection, payload.supplierId);
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
      await requireSupplier(connection, payload.supplierId);
      const sources = await readSourceIds(
        connection,
        lines.map((line) => String(line.id)),
        true,
      );
      let origins:
        | Array<{
            lineId: string;
            evidence: string;
            receiptLineId?: string | null;
            fulfillmentMode: PurchaseFulfillmentMode;
          }>
        | undefined;
      if (order.supplement_reason) {
        if (
          String(order.supplier_id) !== payload.supplierId ||
          lines.length !== payload.items.length ||
          (order.work_order_id === null ? null : String(order.work_order_id)) !==
            payload.workOrderId ||
          order.source_type !== payload.sourceType
        )
          return orderError(
            '补单只能调整计划量、单价、税率、总额与备注，供应商、原采购、物料和需求追溯不能改变',
          );
        origins = lines.map((line, index) => {
          const next = payload.items[index];
          if (
            !next ||
            line.origin_order_line_id === null ||
            line.supplement_evidence === null ||
            String(line.item_id) !== next.itemId ||
            String(line.material_variant_id) !== next.materialVariantId ||
            JSON.stringify(sortedIds(sources.get(String(line.id)) ?? [])) !==
              JSON.stringify(sortedIds(next.demandIds))
          )
            return orderError(
              '补单只能调整计划量、单价、税率、总额与备注，供应商、原采购、物料和需求追溯不能改变',
            );
          return {
            lineId: String(line.origin_order_line_id),
            evidence: line.supplement_evidence,
            receiptLineId:
              line.origin_receipt_line_id === null ? null : String(line.origin_receipt_line_id),
            fulfillmentMode: line.fulfillment_mode,
          };
        });
      }
      const refs = await this.requireMaterials(payload.items);
      await deleteDraftLines(connection, lines);
      await insertLines(connection, id, payload.items, refs, context, origins);
      await connection.execute(
        'UPDATE procurement_order SET supplier_id=?,work_order_id=?,source_type=?,remark=?,version=version+1,updated_by=? WHERE id=? AND version=?',
        [
          payload.supplierId,
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
        order.supplier_id !== locator.order.supplier_id ||
        order.work_order_id !== locator.order.work_order_id ||
        order.source_type !== locator.order.source_type ||
        JSON.stringify(toDraftLines(lines, sources)) !== JSON.stringify(candidateLines)
      )
        return orderError(
          '采购草稿来源已变化，请刷新后重新下单',
          PROCUREMENT_ERROR_CODES.procurementSourceUnavailable,
        );
      if (!lines.length) return orderError('采购单没有物料行');
      await requireSupplier(connection, String(order.supplier_id));
      if (order.supplement_reason)
        await this.assertSupplementOrigins(connection, order, lines, sources);
      const refs = await this.requireMaterials(candidateLines);
      if (order.supplement_reason)
        for (const line of lines)
          await requireSupplementIdentity(
            connection,
            String(line.origin_order_line_id),
            line.origin_receipt_line_id === null ? undefined : String(line.origin_receipt_line_id),
          );
      const refMap = new Map(refs.map((ref) => [`${ref.itemId}:${ref.materialVariantId}`, ref]));
      for (const line of lines) {
        const ref = refMap.get(`${line.item_id}:${line.material_variant_id}`)!;
        const amount = normalizePurchaseLineAmount(toAmountInput(line));
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE procurement_order_line SET item_code_snapshot=?,material_variant_code_snapshot=?,unit_snapshot=?,tax_exclusive_amount=?,tax_inclusive_amount=?,tax_rate_percent=?,total_amount=?,total_amount_source=?,status='open',version=version+1,updated_by=? WHERE id=? AND version=?`,
          [
            ref.itemCode,
            ref.materialVariantCode,
            ref.unit,
            amount.taxExclusiveAmount,
            amount.taxInclusiveAmount,
            amount.taxRatePercent,
            amount.totalAmount,
            amount.totalAmountSource,
            context.actorId,
            line.id,
            line.version,
          ],
        );
        requireOptimisticUpdate(result.affectedRows);
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
      await requireOrderWithoutReceiptFacts(connection, id);
      for (const line of lines)
        if (line.status !== 'cancelled')
          await changeOrderLineStatus(connection, line, 'cancelled', context);
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
      await changeOrderLineStatus(connection, line, 'closed', context);
      const orderStatus = await refreshOrderCompletion(connection, orderId, context);
      await auditOrder(
        connection,
        context,
        'purchase-order-line.close',
        orderId,
        {
          lineId: id,
          status: line.status,
          version: line.version,
          orderStatus: order.status,
          orderVersion: order.version,
        },
        {
          lineId: id,
          status: 'closed',
          version: line.version + 1,
          reason: payload.reason,
          orderStatus,
          orderVersion: order.version + 1,
        },
      );
      return { purchaseOrderId: orderId, version: order.version + 1 };
    });
  }

  reopenLine(
    id: string,
    payload: ReopenPurchaseOrderLinePayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const orderId = await this.locateLineOrder(connection, id);
      const order = await this.lockRoots(connection, orderId, await readLines(connection, orderId));
      if (order.status !== 'ordered' && order.status !== 'completed')
        return orderError(
          '仅已下单或已结束采购可以恢复物料行',
          PROCUREMENT_ERROR_CODES.purchaseOrderState,
        );
      const lines = await readLines(connection, orderId, true);
      const line = lines.find((row) => String(row.id) === id);
      if (!line) return orderError('采购行不存在', PROCUREMENT_ERROR_CODES.purchaseOrderNotFound);
      requireOptimisticUpdate(line.version === payload.version ? 1 : 0);
      if (line.status !== 'closed')
        return orderError('仅已结束的采购行可以恢复', PROCUREMENT_ERROR_CODES.purchaseOrderState);
      await changeOrderLineStatus(connection, line, 'open', context);
      const orderStatus = await refreshOrderCompletion(connection, orderId, context);
      await auditOrder(
        connection,
        context,
        'purchase-order-line.reopen',
        orderId,
        {
          lineId: id,
          status: line.status,
          version: line.version,
          orderStatus: order.status,
          orderVersion: order.version,
        },
        {
          lineId: id,
          status: 'open',
          version: line.version + 1,
          reason: payload.reason,
          orderStatus,
          orderVersion: order.version + 1,
        },
      );
      return { purchaseOrderId: orderId, version: order.version + 1 };
    });
  }

  close(
    id: string,
    payload: ClosePurchaseOrderPayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const order = await this.lockRoots(connection, id, await readLines(connection, id));
      requireOptimisticUpdate(order.version === payload.version ? 1 : 0);
      if (order.status !== 'ordered')
        return orderError('仅已下单采购可以整单结束', PROCUREMENT_ERROR_CODES.purchaseOrderState);
      const lines = await readLines(connection, id, true);
      const openLines = lines.filter((line) => line.status === 'open');
      if (!openLines.length)
        return orderError('采购单没有进行中的物料行', PROCUREMENT_ERROR_CODES.purchaseOrderState);
      for (const line of openLines)
        await changeOrderLineStatus(connection, line, 'closed', context);
      await refreshOrderCompletion(connection, id, context);
      await auditOrder(
        connection,
        context,
        'purchase-order.close',
        id,
        { status: order.status, version: order.version },
        {
          status: 'completed',
          version: order.version + 1,
          reason: payload.reason,
          lineIds: openLines.map((line) => String(line.id)),
        },
      );
      return { purchaseOrderId: id, version: order.version + 1 };
    });
  }

  correctAmounts(
    id: string,
    payload: CorrectPurchaseOrderAmountsPayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const order = await this.lockRoots(connection, id, await readLines(connection, id));
      return correctPurchaseOrderAmounts(connection, order, payload, context);
    });
  }

  supplement(
    id: string,
    payload: CreatePurchaseOrderSupplementPayload,
    context: CommandContext,
  ): Promise<PurchaseOrderCommandResult> {
    return withTransaction(this.pool, async (connection) => {
      const original = await readOrder(connection, id, true);
      if (!original.ordered_at)
        return orderError(
          '补单必须追溯已经正式下单的采购单',
          PROCUREMENT_ERROR_CODES.purchaseOrderState,
        );
      const selectedIds = sortedIds(payload.items.map((item) => item.originOrderLineId));
      if (selectedIds.length !== payload.items.length)
        return orderError('一张补单不能重复引用同一原采购行');
      const lines = await readLines(connection, id, true);
      const byId = new Map(lines.map((line) => [String(line.id), line]));
      const selected = payload.items.map((item) => {
        const line = byId.get(item.originOrderLineId);
        if (!line) return orderError('原采购行不属于所选采购单');
        return line;
      });
      await requireSupplier(connection, String(original.supplier_id));
      const sources = await readSourceIds(connection, selectedIds, true);
      const draft = normalizePurchaseDraft({
        supplierId: String(original.supplier_id),
        workOrderId: original.work_order_id === null ? null : String(original.work_order_id),
        sourceType: original.source_type,
        remark: payload.remark ?? null,
        items: selected.map((line, index) => ({
          taxExclusiveAmount: payload.items[index]!.taxExclusiveAmount ?? null,
          taxInclusiveAmount: payload.items[index]!.taxInclusiveAmount ?? null,
          taxRatePercent: payload.items[index]!.taxRatePercent,
          manualTotalAmount: payload.items[index]!.manualTotalAmount ?? null,
          itemId: String(line.item_id),
          materialVariantId: String(line.material_variant_id),
          plannedQuantity: payload.items[index]!.plannedQuantity,
          demandIds: sources.get(String(line.id)) ?? [],
        })),
      });
      const orderId = await insertOrder(connection, draft, context, payload.supplementReason);
      const refs = await this.requireMaterials(draft.items);
      for (const item of payload.items) {
        await requireSupplementIdentity(
          connection,
          item.originOrderLineId,
          item.originReceiptLineId,
        );
        await requireSupplementCreationEligibility(
          connection,
          payload.supplementReason,
          item.originReceiptLineId,
          this.inventory,
        );
      }
      await insertLines(
        connection,
        orderId,
        draft.items,
        refs,
        context,
        payload.items.map((item) => ({
          lineId: item.originOrderLineId,
          evidence: item.supplementEvidence,
          receiptLineId: item.originReceiptLineId,
          fulfillmentMode:
            payload.supplementReason === 'excess_purchase' ? 'existing_receipt' : 'new_arrival',
        })),
      );
      await auditOrder(connection, context, 'purchase-order.supplement', orderId, null, {
        originPurchaseOrderId: id,
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
    let originalOrderId: string | undefined;
    const originalLineIds = new Set<string>();
    for (const line of lines) {
      if (line.origin_order_line_id === null) return orderError('补单缺少原采购行');
      const originalLineId = String(line.origin_order_line_id);
      if (originalLineIds.has(originalLineId))
        return orderError('一张补单不能重复引用同一原采购行');
      originalLineIds.add(originalLineId);
      const [[origin]] = await connection.query<
        (RowDataPacket &
          Pick<OrderLineRow, 'id' | 'purchase_order_id' | 'item_id' | 'material_variant_id'> & {
            supplier_id: number;
            work_order_id: number | null;
            source_type: string;
            ordered_at: Date | null;
          })[]
      >(
        `SELECT l.id,l.purchase_order_id,l.item_id,l.material_variant_id,
          o.supplier_id,o.work_order_id,o.source_type,o.ordered_at
          FROM procurement_order_line l JOIN procurement_order o ON o.id=l.purchase_order_id
          WHERE l.id=? FOR SHARE`,
        [line.origin_order_line_id],
      );
      if (
        !origin ||
        !origin.ordered_at ||
        String(origin.supplier_id) !== String(order.supplier_id) ||
        origin.work_order_id !== order.work_order_id ||
        origin.source_type !== order.source_type ||
        String(origin.item_id) !== String(line.item_id) ||
        String(origin.material_variant_id) !== String(line.material_variant_id)
      )
        return orderError('补单原采购身份不一致');
      if (originalOrderId && originalOrderId !== String(origin.purchase_order_id))
        return orderError('一张补单只能追溯同一原采购单');
      originalOrderId = String(origin.purchase_order_id);
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
    ...toAmountInput(line),
    itemId: String(line.item_id),
    materialVariantId: String(line.material_variant_id),
    plannedQuantity: Number(line.planned_quantity),
    demandIds: sources.get(String(line.id)) ?? [],
  }));

const toAmountInput = (line: OrderLineRow) => ({
  plannedQuantity: Number(line.planned_quantity),
  taxExclusiveAmount: line.tax_exclusive_amount,
  taxInclusiveAmount: line.tax_inclusive_amount,
  taxRatePercent: line.tax_rate_percent,
  manualTotalAmount: line.total_amount_source === 'manual' ? line.total_amount : null,
});
