import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DEMAND_GENERATION_GROUP_TYPE } from '@company/constants';
import { withTransaction } from '@company/database';
import type {
  CreateReturnOrderPayload,
  CreateStockCheckPayload,
  CreateMaterialLossPayload,
  MaterialLossBatchOption,
  MaterialLossCandidateItem,
  MaterialLossItem,
  MaterialLossQuery,
  PageResult,
  ReturnOrderBatchOption,
  ReturnOrderCandidateItem,
  ReturnOrderItem,
  ReturnOrderQuery,
  SaveStockCheckCountsPayload,
  StockCheckCandidateItem,
  StockCheckCandidateQuery,
  StockCheckOrderItem,
  StockCheckOrderQuery,
  StockStatus,
} from '@company/contracts';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionInventoryRepository } from '../application/ports/production-inventory.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { fixedIntegerQuantity, integerQuantity } from '../domain/integer-quantity.js';
import { requireSameVariantForMaterialLoss } from '../domain/production-material-requirement.policy.js';
import { mysqlProductionDemandPlanWriter } from './mysql-production-demand-plan.writer.js';
import { findBatch } from './mysql-production.shared.js';

type Executor = Pool | PoolConnection;

type ReturnOrderRow = RowDataPacket & {
  id: number;
  return_no: string;
  production_batch_id: number;
  batch_no: string;
  work_order_id: number;
  work_order_no: string;
  product_code: string;
  product_name: string;
  status: ReturnOrderItem['status'];
  return_at: Date | null;
  operator_id: number | null;
  created_by: number;
  created_at: Date;
  version: number;
  remark: string | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
};

type ReturnDetailRow = RowDataPacket & {
  id: number;
  return_id: number;
  allocation_id: number;
  demand_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  product_name_snapshot: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  return_number: string;
  unit_snapshot: string;
  return_stock_status: 'available';
  release_after_return: number;
  inventory_transaction_id: number | null;
  remark: string | null;
};

type ReturnCandidateRow = RowDataPacket & {
  allocation_id: number;
  demand_id: number;
  production_batch_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  product_name_snapshot: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  unit_snapshot: string;
  confirmed_quantity: string;
  occupied_quantity: string;
};

type MaterialLossCandidateRow = ReturnCandidateRow & {
  occupied_return_quantity: string;
  occupied_loss_quantity: string;
};

type MaterialLossRow = RowDataPacket & {
  id: number;
  scrap_no: string;
  production_batch_id: number;
  batch_no: string;
  work_order_id: number;
  work_order_no: string;
  product_code: string;
  product_name: string;
  allocation_id: number;
  demand_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  product_name_snapshot: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  scrap_number: string;
  unit_snapshot: string;
  reason_type: string;
  status: MaterialLossItem['status'];
  confirmed_by: number | null;
  confirmed_at: Date | null;
  created_by: number;
  created_at: Date;
  version: number;
  remark: string | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  supplement_id: number | null;
  supplement_no: string | null;
  supplement_status: 'approved' | 'fulfilled' | null;
  supplement_demand_id: number | null;
  supplement_demand_quantity: string | null;
};

type StockCheckOrderRow = RowDataPacket & {
  id: number;
  check_no: string;
  status: StockCheckOrderItem['status'];
  check_at: Date | null;
  operator_id: number | null;
  created_by: number;
  created_at: Date;
  version: number;
  remark: string | null;
  cancel_reason: string | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
};

type StockCheckDetailRow = RowDataPacket & {
  id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  product_name_snapshot: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  stock_status: StockStatus;
  unit_snapshot: string;
  system_quantity: string;
  actual_quantity: string | null;
  difference_quantity: string | null;
  result: StockCheckOrderItem['details'][number]['result'];
  adjusted: number;
  remark: string | null;
};

type StockCandidateRow = RowDataPacket & {
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  product_name_snapshot: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  stock_status: StockStatus;
  unit_snapshot: string;
  system_quantity: string;
};

const RETURN_ORDER_SELECT = `SELECT ro.id,ro.return_no,ro.production_batch_id,pb.batch_no,
  ro.work_order_id,wo.work_order_no,wo.product_code_snapshot product_code,
  wo.product_name_snapshot product_name,ro.status,ro.return_at,ro.operator_id,
  ro.created_by,ro.created_at,ro.version,ro.remark,ro.cancel_reason,ro.cancelled_by,ro.cancelled_at
 FROM return_order ro
 JOIN production_batches pb ON pb.id=ro.production_batch_id
 JOIN work_orders wo ON wo.id=ro.work_order_id`;

const MATERIAL_LOSS_SELECT = `SELECT scrap.id,scrap.scrap_no,scrap.production_batch_id,
  pb.batch_no,pb.work_order_id,wo.work_order_no,wo.product_code_snapshot product_code,
  wo.product_name_snapshot product_name,scrap.allocation_id,scrap.demand_id,scrap.item_id,
  scrap.material_variant_id,scrap.batch_id,ib.item_code_snapshot,ib.product_name_snapshot,
  ib.material_variant_code_snapshot,ib.batch_code,
  scrap.scrap_number,scrap.unit_snapshot,scrap.reason_type,scrap.status,scrap.confirmed_by,
  scrap.confirmed_at,scrap.created_by,scrap.created_at,scrap.version,scrap.remark,
  scrap.cancel_reason,scrap.cancelled_by,scrap.cancelled_at,
  supplement.id supplement_id,supplement.supplement_no,supplement.status supplement_status,
  supplement_demand.id supplement_demand_id,
  supplement_demand.need_number supplement_demand_quantity
 FROM item_scrap scrap
 JOIN production_batches pb ON pb.id=scrap.production_batch_id
 JOIN work_orders wo ON wo.id=pb.work_order_id
 JOIN item_batch ib ON ib.id=scrap.batch_id
 LEFT JOIN production_material_supplement supplement
   ON supplement.material_loss_scrap_id=scrap.id AND supplement.source_type='material_loss'
 LEFT JOIN production_item_demand supplement_demand
   ON supplement_demand.supplement_id=supplement.id
  AND supplement_demand.demand_type='material_loss_supplement'`;

const STOCK_CHECK_ORDER_SELECT = `SELECT so.id,so.check_no,so.status,so.check_at,
  so.operator_id,so.created_by,so.created_at,so.version,so.remark,
  so.cancel_reason,so.cancelled_by,so.cancelled_at
 FROM stock_check_order so`;

@Injectable()
export class MysqlProductionInventoryRepository extends ProductionInventoryRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async listMaterialLosses(query: MaterialLossQuery): Promise<PageResult<MaterialLossItem>> {
    const where = ["scrap.scrap_scene='production_consumed'"];
    const params: Array<string | number> = [];
    if (query.keyword) {
      where.push(
        '(scrap.scrap_no LIKE ? OR pb.batch_no LIKE ? OR wo.work_order_no LIKE ? OR ib.item_code_snapshot LIKE ? OR ib.product_name_snapshot LIKE ?)',
      );
      params.push(...Array(5).fill(`%${query.keyword}%`));
    }
    if (query.status) {
      where.push('scrap.status=?');
      params.push(query.status);
    }
    const clause = ` WHERE ${where.join(' AND ')}`;
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM item_scrap scrap
       JOIN production_batches pb ON pb.id=scrap.production_batch_id
       JOIN work_orders wo ON wo.id=pb.work_order_id
       JOIN item_batch ib ON ib.id=scrap.batch_id${clause}`,
      params,
    );
    const { page, pageSize, offset } = pagination(query);
    const [rows] = await this.pool.query<MaterialLossRow[]>(
      `${MATERIAL_LOSS_SELECT}${clause} ORDER BY scrap.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return { items: rows.map(mapMaterialLoss), total: Number(count?.total ?? 0), page, pageSize };
  }

  async getMaterialLoss(scrapId: string): Promise<MaterialLossItem> {
    return mapMaterialLoss(await this.findMaterialLoss(this.pool, scrapId));
  }

  async listMaterialLossBatchOptions(): Promise<MaterialLossBatchOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        batch_no: string;
        work_order_no: string;
        product_code: string;
        product_name: string;
        status: 'material_partially_outbound' | 'material_outbound' | 'doing';
      })[]
    >(
      `SELECT DISTINCT pb.id,pb.batch_no,wo.work_order_no,
        wo.product_code_snapshot product_code,wo.product_name_snapshot product_name,pb.status
       FROM production_batches pb JOIN work_orders wo ON wo.id=pb.work_order_id
       JOIN production_item_allocation allocation ON allocation.production_batch_id=pb.id
       WHERE pb.status IN ('material_partially_outbound','material_outbound','doing')
         AND EXISTS (SELECT 1 FROM outbound_detail detail
           JOIN outbound_order outbound ON outbound.id=detail.outbound_id
           WHERE detail.allocation_id=allocation.id AND outbound.status='completed')
       ORDER BY pb.id DESC`,
    );
    return rows.map((row) => ({
      productionBatchId: String(row.id),
      batchNo: row.batch_no,
      workOrderNo: row.work_order_no,
      productCode: row.product_code,
      productName: row.product_name,
      batchStatus: row.status,
    }));
  }

  async listMaterialLossCandidates(batchId: string): Promise<MaterialLossCandidateItem[]> {
    const rows = await this.findMaterialLossCandidates(this.pool, batchId);
    return rows.filter((row) => materialLossAvailable(row) > 0).map(mapMaterialLossCandidate);
  }

  async createMaterialLoss(payload: CreateMaterialLossPayload, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      await lockIds(db, 'production_item_allocation', [payload.allocationId]);
      const candidates = await this.findMaterialLossCandidates(db, payload.productionBatchId);
      const candidate = candidates.find(
        (row) => String(row.allocation_id) === payload.allocationId,
      );
      if (!candidate || payload.scrapQuantity > materialLossAvailable(candidate))
        throw new ProductionDomainError(
          'SCRAP_QUANTITY_EXCEEDED',
          '损耗数量超过当前已确认领料的可申报数量，请刷新后重试',
        );
      const scrapNo = businessNo('SH');
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO item_scrap
         (scrap_no,production_batch_id,demand_id,allocation_id,item_id,material_variant_id,batch_id,scrap_scene,
          scrap_number,unit_snapshot,reason_type,status,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,'production_consumed',?,?,?,'pending',?,?,?)`,
        [
          scrapNo,
          payload.productionBatchId,
          candidate.demand_id,
          candidate.allocation_id,
          candidate.item_id,
          candidate.material_variant_id,
          candidate.batch_id,
          payload.scrapQuantity,
          candidate.unit_snapshot,
          payload.reasonType,
          payload.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      const scrapId = String(created.insertId);
      await this.audit(
        db,
        context,
        'production-material-loss.create',
        'item_scrap',
        scrapId,
        null,
        {
          scrapNo,
          productionBatchId: payload.productionBatchId,
          allocationId: payload.allocationId,
          scrapQuantity: decimal(payload.scrapQuantity),
          reasonType: payload.reasonType,
        },
      );
      return mapMaterialLoss(await this.findMaterialLoss(db, scrapId));
    });
  }

  async confirmMaterialLoss(scrapId: string, version: number, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const [[identity]] = await db.query<(RowDataPacket & { production_batch_id: number })[]>(
        'SELECT production_batch_id FROM item_scrap WHERE id=?',
        [scrapId],
      );
      if (!identity) throw new ProductionDomainError('NOT_FOUND', '损耗记录不存在');
      await findBatch(db, String(identity.production_batch_id), true);
      const scrap = await this.findMaterialLoss(db, scrapId, true);
      if (scrap.status === 'confirmed') return mapMaterialLoss(scrap);
      if (scrap.status !== 'pending')
        throw new ProductionDomainError('SCRAP_CONFIRM_NOT_ALLOWED', '仅待确认损耗可以确认');
      requireVersion(scrap.version, version, '损耗记录');
      await lockIds(db, 'production_item_allocation', [String(scrap.allocation_id)]);
      const candidates = await this.findMaterialLossCandidates(
        db,
        String(scrap.production_batch_id),
      );
      const candidate = candidates.find((row) => row.allocation_id === scrap.allocation_id);
      if (!candidate || materialLossAvailable(candidate) < 0)
        throw new ProductionDomainError(
          'SCRAP_QUANTITY_EXCEEDED',
          '当前领料、退料或损耗占用已变化，请刷新后重试',
        );
      requireSameVariantForMaterialLoss(
        String(scrap.material_variant_id),
        String(candidate.material_variant_id),
      );
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE item_scrap SET status='confirmed',confirmed_by=?,confirmed_at=NOW(),
         updated_by=?,version=version+1 WHERE id=? AND status='pending' AND version=?`,
        [context.actorId, context.actorId, scrapId, version],
      );
      requireAffected(updated, '损耗记录');

      const supplementNo = businessNo('BL');
      const [supplement] = await db.execute<ResultSetHeader>(
        `INSERT INTO production_material_supplement
         (supplement_no,source_type,step_scrap_record_id,material_loss_scrap_id,
          production_batch_id,batch_step_record_id,status,remark,created_by,updated_by)
         VALUES (?,'material_loss',NULL,?,?,NULL,'approved',?,?,?)`,
        [
          supplementNo,
          scrapId,
          scrap.production_batch_id,
          scrap.remark,
          context.actorId,
          context.actorId,
        ],
      );
      const [[sourceDemand]] = await db.query<
        (RowDataPacket & {
          id: number;
          parent_demand_id: number | null;
          requirement_basis_id: number;
          product_material_id: number;
          item_id: number;
          material_variant_id: number;
          item_code_snapshot: string;
          item_name_snapshot: string;
          material_variant_code_snapshot: string;
          quantity_per_unit_snapshot: string;
          unit_snapshot: string;
          is_key_material_snapshot: number;
          need_batch_record_snapshot: number;
          planned_output_quantity_snapshot: string;
        })[]
      >(
        `SELECT id,parent_demand_id,requirement_basis_id,product_material_id,item_id,material_variant_id,item_code_snapshot,item_name_snapshot,material_variant_code_snapshot,quantity_per_unit_snapshot,
          unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,
          planned_output_quantity_snapshot
         FROM production_item_demand WHERE id=? FOR UPDATE`,
        [scrap.demand_id],
      );
      if (!sourceDemand) throw new ProductionDomainError('NOT_FOUND', '损耗来源需求不存在');
      requireSameVariantForMaterialLoss(
        String(scrap.material_variant_id),
        String(sourceDemand.material_variant_id),
      );
      const rootDemandId = sourceDemand.parent_demand_id ?? sourceDemand.id;
      const [demandId] = await mysqlProductionDemandPlanWriter.createDemandGroup(db, {
        batchId: scrap.production_batch_id,
        actorId: context.actorId,
        source: {
          type: DEMAND_GENERATION_GROUP_TYPE.materialLossSupplement,
          supplementId: supplement.insertId,
        },
        lines: [
          {
            identityId: scrapId,
            requirementBasisId: sourceDemand.requirement_basis_id,
            productMaterialId: sourceDemand.product_material_id,
            itemId: sourceDemand.item_id,
            materialVariantId: sourceDemand.material_variant_id,
            materialVariantCode: sourceDemand.material_variant_code_snapshot,
            itemCode: sourceDemand.item_code_snapshot,
            itemName: sourceDemand.item_name_snapshot,
            quantityPerUnit: sourceDemand.quantity_per_unit_snapshot,
            unit: sourceDemand.unit_snapshot,
            isKeyMaterial: sourceDemand.is_key_material_snapshot,
            needBatchRecord: sourceDemand.need_batch_record_snapshot,
            plannedOutputQuantity: sourceDemand.planned_output_quantity_snapshot,
            needNumber: String(integerQuantity(scrap.scrap_number)),
            demandType: 'material_loss_supplement',
            parentDemandId: rootDemandId,
            supplementId: supplement.insertId,
          },
        ],
      });
      await this.audit(
        db,
        context,
        'production-material-loss.confirm',
        'item_scrap',
        scrapId,
        { status: 'pending', version },
        {
          status: 'confirmed',
          version: version + 1,
          supplementId: String(supplement.insertId),
          demandId: demandId!,
          demandQuantity: scrap.scrap_number,
        },
      );
      return mapMaterialLoss(await this.findMaterialLoss(db, scrapId));
    });
  }

  async cancelMaterialLoss(
    scrapId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const scrap = await this.findMaterialLoss(db, scrapId, true);
      if (scrap.status === 'cancelled') return mapMaterialLoss(scrap);
      if (scrap.status !== 'pending')
        throw new ProductionDomainError('SCRAP_CANCEL_NOT_ALLOWED', '仅待确认损耗可以取消');
      requireVersion(scrap.version, version, '损耗记录');
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE item_scrap SET status='cancelled',cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),updated_by=?,version=version+1
         WHERE id=? AND status='pending' AND version=?`,
        [reason, context.actorId, context.actorId, scrapId, version],
      );
      requireAffected(updated, '损耗记录');
      await this.audit(
        db,
        context,
        'production-material-loss.cancel',
        'item_scrap',
        scrapId,
        { status: 'pending', version },
        { status: 'cancelled', reason, version: version + 1 },
      );
      return mapMaterialLoss(await this.findMaterialLoss(db, scrapId));
    });
  }

  async listReturnOrders(query: ReturnOrderQuery): Promise<PageResult<ReturnOrderItem>> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.keyword) {
      where.push(
        '(ro.return_no LIKE ? OR pb.batch_no LIKE ? OR wo.work_order_no LIKE ? OR wo.product_code_snapshot LIKE ? OR wo.product_name_snapshot LIKE ?)',
      );
      params.push(...Array(5).fill(`%${query.keyword}%`));
    }
    if (query.status) {
      where.push('ro.status=?');
      params.push(query.status);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM return_order ro
       JOIN production_batches pb ON pb.id=ro.production_batch_id
       JOIN work_orders wo ON wo.id=ro.work_order_id${clause}`,
      params,
    );
    const { page, pageSize, offset } = pagination(query);
    const [rows] = await this.pool.query<ReturnOrderRow[]>(
      `${RETURN_ORDER_SELECT}${clause} ORDER BY ro.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return {
      items: await this.mapReturnOrders(this.pool, rows),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getReturnOrder(returnId: string): Promise<ReturnOrderItem> {
    return this.loadReturnOrder(this.pool, returnId);
  }

  async listReturnBatchOptions(): Promise<ReturnOrderBatchOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        production_batch_id: number;
        batch_no: string;
        work_order_no: string;
        product_code: string;
        product_name: string;
      })[]
    >(
      `SELECT DISTINCT pb.id production_batch_id,pb.batch_no,wo.work_order_no,
        wo.product_code_snapshot product_code,wo.product_name_snapshot product_name
       FROM production_batches pb
       JOIN work_orders wo ON wo.id=pb.work_order_id
       JOIN production_item_allocation a ON a.production_batch_id=pb.id
       WHERE EXISTS (
         SELECT 1 FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id
         WHERE od.allocation_id=a.id AND oo.status='completed'
       )
       ORDER BY pb.id DESC`,
    );
    return rows.map((row) => ({
      productionBatchId: String(row.production_batch_id),
      batchNo: row.batch_no,
      workOrderNo: row.work_order_no,
      productCode: row.product_code,
      productName: row.product_name,
    }));
  }

  async listReturnCandidates(batchId: string): Promise<ReturnOrderCandidateItem[]> {
    const rows = await this.findReturnCandidates(this.pool, batchId);
    return rows
      .filter(
        (row) => integerQuantity(row.confirmed_quantity) > integerQuantity(row.occupied_quantity),
      )
      .map(mapReturnCandidate);
  }

  async createReturnOrder(payload: CreateReturnOrderPayload, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const batch = await findBatch(db, payload.productionBatchId, true);
      const allocationIds = payload.details.map((line) => line.allocationId).sort(numericSort);
      await lockIds(db, 'production_item_allocation', allocationIds);
      const candidateRows = await this.findReturnCandidates(db, payload.productionBatchId);
      const candidates = new Map(candidateRows.map((row) => [String(row.allocation_id), row]));
      for (const line of payload.details) {
        const candidate = candidates.get(line.allocationId);
        const remaining = candidate
          ? integerQuantity(candidate.confirmed_quantity) -
            integerQuantity(candidate.occupied_quantity)
          : 0;
        if (!candidate || line.returnQuantity <= 0 || line.returnQuantity > remaining) {
          throw new ProductionDomainError(
            'RETURN_QUANTITY_EXCEEDED',
            '退料数量超过当前已确认领料的可退数量，请刷新后重试',
          );
        }
      }
      const returnNo = businessNo('TL');
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO return_order
         (return_no,production_batch_id,work_order_id,status,remark,created_by,updated_by)
         VALUES (?,?,?,'pending',?,?,?)`,
        [
          returnNo,
          payload.productionBatchId,
          batch.work_order_id,
          payload.remark ?? null,
          context.actorId,
          context.actorId,
        ],
      );
      const returnId = String(created.insertId);
      for (const line of payload.details) {
        const candidate = candidates.get(line.allocationId)!;
        await db.execute(
          `INSERT INTO return_detail
           (return_id,production_batch_id,demand_id,allocation_id,item_id,material_variant_id,batch_id,
            return_number,unit_snapshot,return_stock_status,release_after_return,remark,created_by)
           VALUES (?,?,?,?,?,?,?,?,'available',1,?,?)`,
          [
            returnId,
            payload.productionBatchId,
            candidate.demand_id,
            candidate.allocation_id,
            candidate.item_id,
            candidate.material_variant_id,
            candidate.batch_id,
            line.returnQuantity,
            candidate.unit_snapshot,
            line.remark ?? null,
            context.actorId,
          ],
        );
      }
      await this.audit(db, context, 'production-return.create', 'return_order', returnId, null, {
        returnNo,
        productionBatchId: payload.productionBatchId,
        status: 'pending',
        detailCount: payload.details.length,
      });
      return this.loadReturnOrder(db, returnId);
    });
  }

  async confirmReturnOrder(returnId: string, version: number, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const [[identity]] = await db.query<(RowDataPacket & { production_batch_id: number })[]>(
        'SELECT production_batch_id FROM return_order WHERE id=?',
        [returnId],
      );
      if (!identity) throw new ProductionDomainError('NOT_FOUND', '退料单不存在');
      const batch = await findBatch(db, String(identity.production_batch_id), true);
      const order = await this.findReturnOrder(db, returnId, true);
      if (String(order.production_batch_id) !== String(identity.production_batch_id))
        throw new ProductionDomainError('CONCURRENT_MODIFICATION', '退料单所属批次已变化');
      if (order.status === 'returned') return this.loadReturnOrder(db, returnId, order);
      if (order.status !== 'pending')
        throw new ProductionDomainError('RETURN_CONFIRM_NOT_ALLOWED', '仅待确认退料单可以确认入库');
      requireVersion(order.version, version, '退料单');
      const details = await this.findReturnDetails(db, [returnId], true);
      await lockIds(
        db,
        'production_item_allocation',
        details.map((line) => String(line.allocation_id)).sort(numericSort),
      );
      await lockIds(
        db,
        'item_batch',
        [...new Set(details.map((line) => String(line.batch_id)))].sort(numericSort),
      );
      for (const line of details) {
        const [[quantity]] = await db.query<
          (RowDataPacket & { confirmed: string; occupied: string })[]
        >(
          `SELECT
            COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od
              JOIN outbound_order oo ON oo.id=od.outbound_id
              WHERE od.allocation_id=? AND oo.status='completed'),0) confirmed,
            COALESCE((SELECT SUM(rd.return_number) FROM return_detail rd
              JOIN return_order ro ON ro.id=rd.return_id
              WHERE rd.allocation_id=? AND ro.status IN ('pending','returned')),0) occupied`,
          [line.allocation_id, line.allocation_id],
        );
        if (integerQuantity(quantity?.confirmed ?? 0) < integerQuantity(quantity?.occupied ?? 0)) {
          throw new ProductionDomainError(
            'RETURN_QUANTITY_EXCEEDED',
            '退料数量超过当前已确认领料的可退数量，请刷新后重试',
          );
        }
      }
      for (const line of details) {
        await db.execute(
          `INSERT INTO inventory_transaction
           (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,
            reference_type,reference_detail_id,idempotency_key,transaction_group_key,remark,created_by)
           VALUES (?,?,?,'material_return_inbound',?,?,'available','return_detail',?,?,?,?,?)`,
          [
            line.item_id,
            line.material_variant_id,
            line.batch_id,
            line.return_number,
            line.unit_snapshot,
            line.id,
            `RETURN:${line.id}`,
            `RETURN:${returnId}`,
            line.remark,
            context.actorId,
          ],
        );
      }
      if (batch.status === 'material_partially_outbound') {
        const returnedByDemand = new Map<string, number>();
        for (const line of details) {
          const demandId = String(line.demand_id);
          returnedByDemand.set(
            demandId,
            (returnedByDemand.get(demandId) ?? 0) + integerQuantity(line.return_number),
          );
        }
        await mysqlProductionDemandPlanWriter.reopenAfterPreStartReturn(db, {
          batchId: identity.production_batch_id,
          actorId: context.actorId,
          returnedByDemand,
        });
      }
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE return_order SET status='returned',return_at=CURRENT_TIMESTAMP,
         operator_id=?,updated_by=?,version=version+1
         WHERE id=? AND status='pending' AND version=?`,
        [context.actorId, context.actorId, returnId, version],
      );
      requireAffected(updated, '退料单');
      await this.audit(
        db,
        context,
        'production-return.confirm',
        'return_order',
        returnId,
        { status: 'pending', version },
        {
          status: 'returned',
          version: version + 1,
          shortBatchMaterialPlanInvalidated: batch.status === 'material_partially_outbound',
        },
      );
      return this.loadReturnOrder(db, returnId);
    });
  }

  async cancelReturnOrder(
    returnId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const order = await this.findReturnOrder(db, returnId, true);
      if (order.status === 'cancelled') return this.loadReturnOrder(db, returnId, order);
      if (order.status !== 'pending')
        throw new ProductionDomainError('RETURN_CANCEL_NOT_ALLOWED', '仅待确认退料单可以取消');
      requireVersion(order.version, version, '退料单');
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE return_order SET status='cancelled',cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),updated_by=?,version=version+1
         WHERE id=? AND status='pending' AND version=?`,
        [reason, context.actorId, context.actorId, returnId, version],
      );
      requireAffected(updated, '退料单');
      await this.audit(
        db,
        context,
        'production-return.cancel',
        'return_order',
        returnId,
        { status: 'pending', version },
        { status: 'cancelled', reason, version: version + 1 },
      );
      return this.loadReturnOrder(db, returnId);
    });
  }

  async listStockChecks(query: StockCheckOrderQuery): Promise<PageResult<StockCheckOrderItem>> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.keyword) {
      where.push('so.check_no LIKE ?');
      params.push(`%${query.keyword}%`);
    }
    if (query.status) {
      where.push('so.status=?');
      params.push(query.status);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM stock_check_order so${clause}`,
      params,
    );
    const { page, pageSize, offset } = pagination(query);
    const [rows] = await this.pool.query<StockCheckOrderRow[]>(
      `${STOCK_CHECK_ORDER_SELECT}${clause} ORDER BY so.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return {
      items: await this.mapStockChecks(this.pool, rows),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getStockCheck(stockCheckId: string): Promise<StockCheckOrderItem> {
    return this.loadStockCheck(this.pool, stockCheckId);
  }

  async listStockCheckCandidates(
    query: StockCheckCandidateQuery,
  ): Promise<PageResult<StockCheckCandidateItem>> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (query.keyword) {
      where.push(
        '(ib.item_code_snapshot LIKE ? OR ib.product_name_snapshot LIKE ? OR ib.batch_code LIKE ?)',
      );
      params.push(...Array(3).fill(`%${query.keyword}%`));
    }
    if (query.stockStatus) {
      where.push('it.stock_status=?');
      params.push(query.stockStatus);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const base = `FROM item_batch ib JOIN inventory_transaction it
      ON it.batch_id=ib.id AND it.item_id=ib.item_id AND it.material_variant_id=ib.material_variant_id${clause}
      GROUP BY ib.id,it.stock_status HAVING SUM(it.quantity)>0`;
    const [[count]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM (SELECT ib.id ${base}) candidates`,
      params,
    );
    const { page, pageSize, offset } = pagination(query);
    const [rows] = await this.pool.query<StockCandidateRow[]>(
      `SELECT ib.item_id,ib.material_variant_id,ib.id batch_id,ib.item_code_snapshot,ib.product_name_snapshot,
       ib.material_variant_code_snapshot,ib.batch_code,it.stock_status,ib.unit_snapshot,SUM(it.quantity) system_quantity
       ${base} ORDER BY ib.id DESC,it.stock_status LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return {
      items: rows.map(mapStockCandidate),
      total: Number(count?.total ?? 0),
      page,
      pageSize,
    };
  }

  async createStockCheck(payload: CreateStockCheckPayload, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const batchIds = [...new Set(payload.details.map((line) => line.itemBatchId))].sort(
        numericSort,
      );
      await lockIds(db, 'item_batch', batchIds);
      const checkNo = payload.checkNo || businessNo('PD');
      let created: ResultSetHeader;
      try {
        [created] = await db.execute<ResultSetHeader>(
          `INSERT INTO stock_check_order
           (check_no,status,remark,created_by,updated_by) VALUES (?,'pending',?,?,?)`,
          [checkNo, payload.remark ?? null, context.actorId, context.actorId],
        );
      } catch (error) {
        if (isDuplicate(error))
          throw new ProductionDomainError('CONFLICT', '盘点单号已存在，请更换后重试');
        throw error;
      }
      const stockCheckId = String(created.insertId);
      for (const line of payload.details) {
        const [[target]] = await db.query<
          (RowDataPacket & {
            item_id: number;
            material_variant_id: number;
            unit_snapshot: string;
            system_quantity: string;
          })[]
        >(
          `SELECT ib.item_id,ib.material_variant_id,ib.unit_snapshot,COALESCE(SUM(it.quantity),0) system_quantity
           FROM item_batch ib LEFT JOIN inventory_transaction it
             ON it.batch_id=ib.id AND it.item_id=ib.item_id AND it.material_variant_id=ib.material_variant_id AND it.stock_status=?
           WHERE ib.id=? GROUP BY ib.id`,
          [line.stockStatus, line.itemBatchId],
        );
        if (!target) throw new ProductionDomainError('NOT_FOUND', '库存批次不存在');
        if (integerQuantity(target.system_quantity) <= 0)
          throw new ProductionDomainError('CONFLICT', '所选库存批次或状态已无正库存，请刷新后重试');
        await db.execute(
          `INSERT INTO stock_check_detail
           (stock_check_id,item_id,material_variant_id,batch_id,stock_status,unit_snapshot,system_quantity,created_by)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            stockCheckId,
            target.item_id,
            target.material_variant_id,
            line.itemBatchId,
            line.stockStatus,
            target.unit_snapshot,
            target.system_quantity,
            context.actorId,
          ],
        );
      }
      await this.audit(
        db,
        context,
        'production-stock-check.create',
        'stock_check_order',
        stockCheckId,
        null,
        { checkNo, status: 'pending', detailCount: payload.details.length },
      );
      return this.loadStockCheck(db, stockCheckId);
    });
  }

  async saveStockCheckCounts(
    stockCheckId: string,
    payload: SaveStockCheckCountsPayload,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const order = await this.findStockCheck(db, stockCheckId, true);
      if (!['pending', 'counting'].includes(order.status))
        throw new ProductionDomainError(
          'STOCK_CHECK_COUNT_NOT_ALLOWED',
          '仅待盘点或盘点中的单据可以录入数量',
        );
      requireVersion(order.version, payload.version, '盘点单');
      const details = await this.findStockCheckDetails(db, [stockCheckId], true);
      const byId = new Map(details.map((line) => [String(line.id), line]));
      for (const line of payload.details) {
        if (!byId.has(line.detailId))
          throw new ProductionDomainError('NOT_FOUND', '盘点明细不存在或不属于当前盘点单');
        if (line.actualQuantity < 0)
          throw new ProductionDomainError('INVALID_INPUT', '盘点实盘数量不能小于零');
        await db.execute(
          'UPDATE stock_check_detail SET actual_quantity=?,remark=? WHERE id=? AND stock_check_id=?',
          [line.actualQuantity, line.remark ?? null, line.detailId, stockCheckId],
        );
      }
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE stock_check_order SET status='counting',updated_by=?,version=version+1
         WHERE id=? AND status IN ('pending','counting') AND version=?`,
        [context.actorId, stockCheckId, payload.version],
      );
      requireAffected(updated, '盘点单');
      await this.audit(
        db,
        context,
        'production-stock-check.count',
        'stock_check_order',
        stockCheckId,
        { status: order.status, version: payload.version },
        {
          status: 'counting',
          version: payload.version + 1,
          updatedDetailCount: payload.details.length,
        },
      );
      return this.loadStockCheck(db, stockCheckId);
    });
  }

  async completeStockCheck(stockCheckId: string, version: number, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const order = await this.findStockCheck(db, stockCheckId, true);
      if (order.status === 'completed') return this.loadStockCheck(db, stockCheckId, order);
      if (!['pending', 'counting'].includes(order.status))
        throw new ProductionDomainError(
          'STOCK_CHECK_COUNT_NOT_ALLOWED',
          '仅待盘点或盘点中的单据可以完成盘点',
        );
      requireVersion(order.version, version, '盘点单');
      const details = await this.findStockCheckDetails(db, [stockCheckId], true);
      if (details.some((line) => line.actual_quantity === null))
        throw new ProductionDomainError('STOCK_CHECK_INCOMPLETE', '请先录入全部明细的实盘数量');
      await lockIds(
        db,
        'item_batch',
        [...new Set(details.map((line) => String(line.batch_id)))].sort(numericSort),
      );
      for (const line of details) {
        const [[balance]] = await db.query<(RowDataPacket & { quantity: string })[]>(
          `SELECT COALESCE(SUM(quantity),0) quantity FROM inventory_transaction
           WHERE item_id=? AND material_variant_id=? AND batch_id=? AND stock_status=?`,
          [line.item_id, line.material_variant_id, line.batch_id, line.stock_status],
        );
        if (integerQuantity(balance?.quantity ?? 0) !== integerQuantity(line.system_quantity)) {
          throw new ProductionDomainError(
            'STOCK_CHECK_SNAPSHOT_CHANGED',
            '盘点期间库存已变化，本单不能完成，请取消后重新创建盘点单',
          );
        }
      }
      for (const line of details) {
        const difference =
          integerQuantity(line.actual_quantity!) - integerQuantity(line.system_quantity);
        if (difference !== 0) {
          await db.execute(
            `INSERT INTO inventory_transaction
             (item_id,material_variant_id,batch_id,transaction_type,quantity,unit_snapshot,stock_status,
              reference_type,reference_detail_id,idempotency_key,transaction_group_key,remark,created_by)
             VALUES (?,?,?,'stock_check_adjustment',?,?,?,'stock_check_detail',?,?,?,?,?)`,
            [
              line.item_id,
              line.material_variant_id,
              line.batch_id,
              decimal(difference),
              line.unit_snapshot,
              line.stock_status,
              line.id,
              `STOCKCHECK:${line.id}`,
              `STOCKCHECK:${stockCheckId}`,
              line.remark,
              context.actorId,
            ],
          );
        }
      }
      await db.execute('UPDATE stock_check_detail SET adjusted=1 WHERE stock_check_id=?', [
        stockCheckId,
      ]);
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE stock_check_order SET status='completed',check_at=CURRENT_TIMESTAMP,
         operator_id=?,updated_by=?,version=version+1
         WHERE id=? AND status IN ('pending','counting') AND version=?`,
        [context.actorId, context.actorId, stockCheckId, version],
      );
      requireAffected(updated, '盘点单');
      await this.audit(
        db,
        context,
        'production-stock-check.complete',
        'stock_check_order',
        stockCheckId,
        { status: order.status, version },
        { status: 'completed', version: version + 1 },
      );
      return this.loadStockCheck(db, stockCheckId);
    });
  }

  async cancelStockCheck(
    stockCheckId: string,
    version: number,
    reason: string,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      const order = await this.findStockCheck(db, stockCheckId, true);
      if (order.status === 'cancelled') return this.loadStockCheck(db, stockCheckId, order);
      if (!['pending', 'counting'].includes(order.status))
        throw new ProductionDomainError(
          'STOCK_CHECK_CANCEL_NOT_ALLOWED',
          '仅待盘点或盘点中的单据可以取消',
        );
      requireVersion(order.version, version, '盘点单');
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE stock_check_order SET status='cancelled',cancel_reason=?,cancelled_by=?,cancelled_at=NOW(),updated_by=?,version=version+1
         WHERE id=? AND status IN ('pending','counting') AND version=?`,
        [reason, context.actorId, context.actorId, stockCheckId, version],
      );
      requireAffected(updated, '盘点单');
      await this.audit(
        db,
        context,
        'production-stock-check.cancel',
        'stock_check_order',
        stockCheckId,
        { status: order.status, version },
        { status: 'cancelled', reason, version: version + 1 },
      );
      return this.loadStockCheck(db, stockCheckId);
    });
  }

  private async findMaterialLossCandidates(db: Executor, batchId: string) {
    const [rows] = await db.query<MaterialLossCandidateRow[]>(
      `SELECT allocation.id allocation_id,allocation.demand_id,
        allocation.production_batch_id,allocation.item_id,allocation.material_variant_id,allocation.batch_id,
        item_batch.item_code_snapshot,item_batch.product_name_snapshot,item_batch.material_variant_code_snapshot,item_batch.batch_code,
        allocation.unit_snapshot,
        COALESCE((SELECT SUM(detail.outbound_number) FROM outbound_detail detail
          JOIN outbound_order outbound ON outbound.id=detail.outbound_id
          WHERE detail.allocation_id=allocation.id AND outbound.status='completed'),0)
          confirmed_quantity,
        COALESCE((SELECT SUM(return_detail.return_number) FROM return_detail
          JOIN return_order ON return_order.id=return_detail.return_id
          WHERE return_detail.allocation_id=allocation.id
            AND return_order.status IN ('pending','returned')),0) occupied_return_quantity,
        COALESCE((SELECT SUM(loss.scrap_number) FROM item_scrap loss
          WHERE loss.allocation_id=allocation.id
            AND loss.status IN ('pending','confirmed')),0) occupied_loss_quantity,
        0 occupied_quantity
       FROM production_item_allocation allocation
       JOIN item_batch item_batch ON item_batch.id=allocation.batch_id
       JOIN production_batches batch ON batch.id=allocation.production_batch_id
       WHERE allocation.production_batch_id=?
         AND batch.status IN ('material_partially_outbound','material_outbound','doing')
       ORDER BY allocation.id`,
      [batchId],
    );
    return rows;
  }

  private async findMaterialLoss(db: Executor, id: string, lock = false) {
    if (lock) {
      const [[locked]] = await db.query<(RowDataPacket & { id: number })[]>(
        'SELECT id FROM item_scrap WHERE id=? FOR UPDATE',
        [id],
      );
      if (!locked) throw new ProductionDomainError('NOT_FOUND', '生产领料损耗记录不存在');
    }
    const [[row]] = await db.query<MaterialLossRow[]>(`${MATERIAL_LOSS_SELECT} WHERE scrap.id=?`, [
      id,
    ]);
    if (!row) throw new ProductionDomainError('NOT_FOUND', '生产领料损耗记录不存在');
    return row;
  }

  private async findReturnCandidates(db: Executor, batchId: string) {
    const [rows] = await db.query<ReturnCandidateRow[]>(
      `SELECT a.id allocation_id,a.demand_id,a.production_batch_id,a.item_id,a.material_variant_id,a.batch_id,
        ib.item_code_snapshot,ib.product_name_snapshot,ib.material_variant_code_snapshot,ib.batch_code,a.unit_snapshot,
        COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od
          JOIN outbound_order oo ON oo.id=od.outbound_id
          WHERE od.allocation_id=a.id AND oo.status='completed'),0) confirmed_quantity,
        COALESCE((SELECT SUM(rd.return_number) FROM return_detail rd
          JOIN return_order ro ON ro.id=rd.return_id
          WHERE rd.allocation_id=a.id AND ro.status IN ('pending','returned')),0) occupied_quantity
       FROM production_item_allocation a JOIN item_batch ib ON ib.id=a.batch_id
       WHERE a.production_batch_id=?
       ORDER BY a.id`,
      [batchId],
    );
    return rows;
  }

  private async findReturnOrder(db: Executor, id: string, lock = false) {
    const [[row]] = await db.query<ReturnOrderRow[]>(
      `${RETURN_ORDER_SELECT} WHERE ro.id=?${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '退料单不存在');
    return row;
  }

  private async findReturnDetails(db: Executor, orderIds: string[], lock = false) {
    if (!orderIds.length) return [];
    const [rows] = await db.query<ReturnDetailRow[]>(
      `SELECT rd.id,rd.return_id,rd.allocation_id,rd.demand_id,rd.item_id,rd.material_variant_id,rd.batch_id,
       ib.item_code_snapshot,ib.product_name_snapshot,ib.material_variant_code_snapshot,ib.batch_code,rd.return_number,
       rd.unit_snapshot,rd.return_stock_status,rd.release_after_return,it.id inventory_transaction_id,
       rd.remark
       FROM return_detail rd JOIN item_batch ib ON ib.id=rd.batch_id
       LEFT JOIN inventory_transaction it ON it.reference_type='return_detail'
         AND it.reference_detail_id=rd.id AND it.transaction_type='material_return_inbound'
       WHERE rd.return_id IN (${placeholders(orderIds)}) ORDER BY rd.return_id,rd.id${lock ? ' FOR UPDATE' : ''}`,
      orderIds,
    );
    return rows;
  }

  private async mapReturnOrders(db: Executor, rows: ReturnOrderRow[]) {
    if (!rows.length) return [];
    const details = await this.findReturnDetails(
      db,
      rows.map((row) => String(row.id)),
    );
    const byOrder = groupBy(details, (line) => String(line.return_id));
    return rows.map((row) => mapReturnOrder(row, byOrder.get(String(row.id)) ?? []));
  }

  private async loadReturnOrder(db: Executor, id: string, known?: ReturnOrderRow) {
    const row = known ?? (await this.findReturnOrder(db, id));
    const details = await this.findReturnDetails(db, [id]);
    return mapReturnOrder(row, details);
  }

  private async findStockCheck(db: Executor, id: string, lock = false) {
    const [[row]] = await db.query<StockCheckOrderRow[]>(
      `${STOCK_CHECK_ORDER_SELECT} WHERE so.id=?${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '盘点单不存在');
    return row;
  }

  private async findStockCheckDetails(db: Executor, orderIds: string[], lock = false) {
    if (!orderIds.length) return [];
    const [rows] = await db.query<StockCheckDetailRow[]>(
      `SELECT sd.id,sd.stock_check_id,sd.item_id,sd.material_variant_id,sd.batch_id,ib.item_code_snapshot,
       ib.product_name_snapshot,ib.material_variant_code_snapshot,ib.batch_code,sd.stock_status,sd.unit_snapshot,
       sd.system_quantity,sd.actual_quantity,sd.difference_quantity,sd.result,sd.adjusted,sd.remark
       FROM stock_check_detail sd JOIN item_batch ib ON ib.id=sd.batch_id
       WHERE sd.stock_check_id IN (${placeholders(orderIds)})
       ORDER BY sd.stock_check_id,sd.id${lock ? ' FOR UPDATE' : ''}`,
      orderIds,
    );
    return rows;
  }

  private async mapStockChecks(db: Executor, rows: StockCheckOrderRow[]) {
    if (!rows.length) return [];
    const [details] = await db.query<(StockCheckDetailRow & { stock_check_id: number })[]>(
      `SELECT sd.id,sd.stock_check_id,sd.item_id,sd.material_variant_id,sd.batch_id,ib.item_code_snapshot,
       ib.product_name_snapshot,ib.material_variant_code_snapshot,ib.batch_code,sd.stock_status,sd.unit_snapshot,
       sd.system_quantity,sd.actual_quantity,sd.difference_quantity,sd.result,sd.adjusted,sd.remark
       FROM stock_check_detail sd JOIN item_batch ib ON ib.id=sd.batch_id
       WHERE sd.stock_check_id IN (${placeholders(rows)}) ORDER BY sd.stock_check_id,sd.id`,
      rows.map((row) => row.id),
    );
    const grouped = groupBy(details, (line) => String(line.stock_check_id));
    return rows.map((row) => mapStockCheck(row, grouped.get(String(row.id)) ?? []));
  }

  private async loadStockCheck(db: Executor, id: string, known?: StockCheckOrderRow) {
    const row = known ?? (await this.findStockCheck(db, id));
    const details = await this.findStockCheckDetails(db, [id]);
    return mapStockCheck(row, details);
  }

  private audit(
    db: PoolConnection,
    context: CommandContext,
    action: string,
    targetType: string,
    targetId: string,
    beforeData: unknown,
    afterData: unknown,
  ) {
    return writeTransactionalAudit(db, {
      logType: 'business',
      module: 'production',
      action,
      userId: context.actorId,
      targetId,
      targetType,
      result: 'success',
      beforeData,
      afterData,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}

const mapReturnCandidate = (row: ReturnCandidateRow): ReturnOrderCandidateItem => ({
  allocationId: String(row.allocation_id),
  demandId: String(row.demand_id),
  itemId: String(row.item_id),
  materialVariantId: String(row.material_variant_id),
  materialVariantCode: row.material_variant_code_snapshot,
  itemCode: row.item_code_snapshot,
  itemName: row.product_name_snapshot,
  itemBatchId: String(row.batch_id),
  batchCode: row.batch_code,
  confirmedOutboundQuantity: decimal(integerQuantity(row.confirmed_quantity)),
  occupiedReturnQuantity: decimal(integerQuantity(row.occupied_quantity)),
  returnableQuantity: decimal(
    integerQuantity(row.confirmed_quantity) - integerQuantity(row.occupied_quantity),
  ),
  unit: row.unit_snapshot,
});

const materialLossAvailable = (row: MaterialLossCandidateRow) =>
  integerQuantity(row.confirmed_quantity) -
  integerQuantity(row.occupied_return_quantity) -
  integerQuantity(row.occupied_loss_quantity);

const mapMaterialLossCandidate = (row: MaterialLossCandidateRow): MaterialLossCandidateItem => ({
  allocationId: String(row.allocation_id),
  demandId: String(row.demand_id),
  itemId: String(row.item_id),
  materialVariantId: String(row.material_variant_id),
  materialVariantCode: row.material_variant_code_snapshot,
  itemCode: row.item_code_snapshot,
  itemName: row.product_name_snapshot,
  itemBatchId: String(row.batch_id),
  batchCode: row.batch_code,
  confirmedOutboundQuantity: row.confirmed_quantity,
  occupiedReturnQuantity: row.occupied_return_quantity,
  occupiedLossQuantity: row.occupied_loss_quantity,
  availableLossQuantity: decimal(Math.max(0, materialLossAvailable(row))),
  unit: row.unit_snapshot,
});

const mapMaterialLoss = (row: MaterialLossRow): MaterialLossItem => ({
  id: String(row.id),
  scrapNo: row.scrap_no,
  productionBatchId: String(row.production_batch_id),
  batchNo: row.batch_no,
  workOrderId: String(row.work_order_id),
  workOrderNo: row.work_order_no,
  productCode: row.product_code,
  productName: row.product_name,
  allocationId: String(row.allocation_id),
  demandId: String(row.demand_id),
  itemId: String(row.item_id),
  materialVariantId: String(row.material_variant_id),
  materialVariantCode: row.material_variant_code_snapshot,
  itemCode: row.item_code_snapshot,
  itemName: row.product_name_snapshot,
  itemBatchId: String(row.batch_id),
  batchCode: row.batch_code,
  scrapScene: 'production_consumed',
  scrapQuantity: row.scrap_number,
  unit: row.unit_snapshot,
  reasonType: row.reason_type,
  status: row.status,
  confirmedById: row.confirmed_by === null ? null : String(row.confirmed_by),
  confirmedByName: null,
  confirmedAt: iso(row.confirmed_at),
  createdById: String(row.created_by),
  createdByName: null,
  createdAt: toBeijingISOString(row.created_at),
  version: row.version,
  remark: row.remark,
  cancelReason: row.cancel_reason,
  cancelledById: row.cancelled_by === null ? null : String(row.cancelled_by),
  cancelledByName: null,
  cancelledAt: iso(row.cancelled_at),
  supplement:
    row.supplement_id === null || row.supplement_demand_id === null
      ? null
      : {
          supplementId: String(row.supplement_id),
          supplementNo: row.supplement_no!,
          status: row.supplement_status!,
          demandId: String(row.supplement_demand_id),
          demandQuantity: row.supplement_demand_quantity!,
        },
});

const mapReturnOrder = (row: ReturnOrderRow, details: ReturnDetailRow[]): ReturnOrderItem => ({
  id: String(row.id),
  returnNo: row.return_no,
  productionBatchId: String(row.production_batch_id),
  batchNo: row.batch_no,
  workOrderId: String(row.work_order_id),
  workOrderNo: row.work_order_no,
  productCode: row.product_code,
  productName: row.product_name,
  status: row.status,
  returnAt: iso(row.return_at),
  operatorId: row.operator_id === null ? null : String(row.operator_id),
  operatorName: null,
  createdById: String(row.created_by),
  createdByName: null,
  createdAt: toBeijingISOString(row.created_at),
  version: row.version,
  remark: row.remark,
  cancelReason: row.cancel_reason,
  cancelledById: row.cancelled_by === null ? null : String(row.cancelled_by),
  cancelledByName: null,
  cancelledAt: iso(row.cancelled_at),
  details: details.map((line) => ({
    id: String(line.id),
    allocationId: String(line.allocation_id),
    demandId: String(line.demand_id),
    itemId: String(line.item_id),
    materialVariantId: String(line.material_variant_id),
    materialVariantCode: line.material_variant_code_snapshot,
    itemCode: line.item_code_snapshot,
    itemName: line.product_name_snapshot,
    itemBatchId: String(line.batch_id),
    batchCode: line.batch_code,
    returnQuantity: line.return_number,
    unit: line.unit_snapshot,
    returnStockStatus: 'available',
    releaseAfterReturn: true,
    inventoryTransactionId:
      line.inventory_transaction_id === null ? null : String(line.inventory_transaction_id),
    remark: line.remark,
  })),
});

const mapStockCandidate = (row: StockCandidateRow): StockCheckCandidateItem => ({
  itemId: String(row.item_id),
  materialVariantId: String(row.material_variant_id),
  materialVariantCode: row.material_variant_code_snapshot,
  itemCode: row.item_code_snapshot,
  itemName: row.product_name_snapshot,
  itemBatchId: String(row.batch_id),
  batchCode: row.batch_code,
  stockStatus: row.stock_status,
  systemQuantity: row.system_quantity,
  unit: row.unit_snapshot,
});

const mapStockCheck = (
  row: StockCheckOrderRow,
  details: StockCheckDetailRow[],
): StockCheckOrderItem => ({
  id: String(row.id),
  checkNo: row.check_no,
  status: row.status,
  checkAt: iso(row.check_at),
  operatorId: row.operator_id === null ? null : String(row.operator_id),
  operatorName: null,
  createdById: String(row.created_by),
  createdByName: null,
  createdAt: toBeijingISOString(row.created_at),
  version: row.version,
  remark: row.remark,
  cancelReason: row.cancel_reason,
  cancelledById: row.cancelled_by === null ? null : String(row.cancelled_by),
  cancelledByName: null,
  cancelledAt: iso(row.cancelled_at),
  detailCount: details.length,
  pendingCount: details.filter((line) => line.actual_quantity === null).length,
  differenceCount: details.filter((line) => line.result === 'surplus' || line.result === 'shortage')
    .length,
  details: details.map((line) => ({
    id: String(line.id),
    itemId: String(line.item_id),
    materialVariantId: String(line.material_variant_id),
    materialVariantCode: line.material_variant_code_snapshot,
    itemCode: line.item_code_snapshot,
    itemName: line.product_name_snapshot,
    itemBatchId: String(line.batch_id),
    batchCode: line.batch_code,
    stockStatus: line.stock_status,
    unit: line.unit_snapshot,
    systemQuantity: line.system_quantity,
    actualQuantity: line.actual_quantity,
    differenceQuantity: line.difference_quantity,
    result: line.result,
    adjusted: line.adjusted === 1,
    remark: line.remark,
  })),
});

const pagination = (query: { page?: number; pageSize?: number }) => {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
};
const placeholders = (values: { length: number }) => Array(values.length).fill('?').join(',');
const numericSort = (a: string, b: string) => Number(a) - Number(b);
const decimal = fixedIntegerQuantity;
const iso = (value: Date | null) => (value ? toBeijingISOString(value) : null);
const businessNo = (prefix: string) =>
  `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
const isDuplicate = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: string }).code === 'ER_DUP_ENTRY';
const requireVersion = (current: number, expected: number, target: string) => {
  if (current !== expected)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', `${target}版本已变化，请刷新后重试`);
};
const requireAffected = (result: ResultSetHeader, target: string) => {
  if (result.affectedRows !== 1)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', `${target}已被其他操作修改`);
};
const lockIds = async (
  db: PoolConnection,
  table: 'item_batch' | 'production_item_allocation',
  ids: string[],
) => {
  if (!ids.length) return;
  await db.query(
    `SELECT id FROM ${table} WHERE id IN (${placeholders(ids)}) ORDER BY id FOR UPDATE`,
    ids,
  );
};
const groupBy = <T>(values: T[], key: (value: T) => string) => {
  const result = new Map<string, T[]>();
  for (const value of values) result.set(key(value), [...(result.get(key(value)) ?? []), value]);
  return result;
};
