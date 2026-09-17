import { currentMaterialNameSql } from './queries/material-name.sql.js';
import { Inject, Injectable } from '@nestjs/common';
import { DEMAND_GENERATION_GROUP_TYPE } from '@company/constants';
import { withTransaction } from '@company/database';
import type {
  CreateMaterialLossPayload,
  MaterialLossBatchOption,
  MaterialLossCandidateItem,
  MaterialLossItem,
  MaterialLossQuery,
  PageResult,
} from '@company/contracts';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { requireSameVariantForMaterialLoss } from '../domain/production-material-requirement.policy.js';
import { mysqlProductionDemandPlanWriter } from './mysql-production-demand-plan.writer.js';
import { findBatch } from './mysql-production.shared.js';
import {
  lockWorkOrderForBatch,
  requireWorkOrderMaterialVariant,
} from './mysql-work-order-material-version.js';
import { ProductionMaterialLossRepository } from '../application/ports/production-material-loss.repository.js';
import {
  pagination,
  decimal,
  iso,
  businessNo,
  requireVersion,
  requireAffected,
  lockIds,
  writeInventoryAudit,
} from './mysql-production-inventory.shared.js';

type Executor = Pool | PoolConnection;

type MaterialLossCandidateRow = RowDataPacket & {
  allocation_id: number;
  demand_id: number;
  production_batch_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  item_code_snapshot: string;
  item_name: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  unit_snapshot: string;
  confirmed_quantity: string;
  occupied_quantity: string;
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
  item_name: string;
  material_variant_code_snapshot: string;
  batch_code: string;
  scrap_number: string;
  unit_snapshot: string;
  reason_type: string;
  loss_purpose: MaterialLossItem['purpose'];
  closeout_id: number | null;
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
  supplement_status: 'approved' | 'fulfilled' | 'cancelled' | null;
  supplement_demand_id: number | null;
  supplement_demand_quantity: string | null;
};

const MATERIAL_LOSS_SELECT = `SELECT scrap.id,scrap.scrap_no,scrap.production_batch_id,
  pb.batch_no,pb.work_order_id,wo.work_order_no,wo.product_code_snapshot product_code,
  wo.product_name_snapshot product_name,scrap.allocation_id,scrap.demand_id,scrap.item_id,
  scrap.material_variant_id,scrap.batch_id,ib.item_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,
  ib.material_variant_code_snapshot,ib.batch_code,
  scrap.scrap_number,scrap.unit_snapshot,scrap.reason_type,scrap.loss_purpose,scrap.closeout_id,scrap.status,scrap.confirmed_by,
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

@Injectable()
export class MysqlProductionMaterialLossRepository extends ProductionMaterialLossRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async listMaterialLosses(query: MaterialLossQuery): Promise<PageResult<MaterialLossItem>> {
    const where = ["scrap.scrap_scene='production_consumed'"];
    const params: Array<string | number> = [];
    if (query.keyword) {
      where.push(
        `(scrap.scrap_no LIKE ? OR pb.batch_no LIKE ? OR wo.work_order_no LIKE ? OR ib.item_code_snapshot LIKE ? OR ${currentMaterialNameSql('ib.item_id')} LIKE ?)`,
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
      await lockWorkOrderForBatch(db, payload.productionBatchId);
      const batch = await findBatch(db, payload.productionBatchId, true);
      if (!['material_partially_outbound', 'material_outbound', 'doing'].includes(batch.status))
        throw new ProductionDomainError(
          'INVALID_STATE',
          '批次已停止生产，不能再申请会生成补料的损耗',
        );
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
          loss_purpose,scrap_number,unit_snapshot,reason_type,status,remark,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,'production_consumed','replenishment',?,?,?,'pending',?,?,?)`,
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
      await writeInventoryAudit(
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
      const orderPolicy = await lockWorkOrderForBatch(db, String(identity.production_batch_id));
      await findBatch(db, String(identity.production_batch_id), true);
      const scrap = await this.findMaterialLoss(db, scrapId, true);
      if (scrap.loss_purpose !== 'replenishment')
        throw new ProductionDomainError(
          'SCRAP_CONFIRM_NOT_ALLOWED',
          '结案损坏登记已确认且不补料，不能使用在产损耗确认',
        );
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
          material_variant_code_snapshot: string;
          quantity_per_unit_snapshot: string;
          unit_snapshot: string;
          planned_output_quantity_snapshot: string;
        })[]
      >(
        `SELECT id,parent_demand_id,requirement_basis_id,product_material_id,item_id,material_variant_id,item_code_snapshot,material_variant_code_snapshot,quantity_per_unit_snapshot,
          unit_snapshot,planned_output_quantity_snapshot
         FROM production_item_demand WHERE id=? FOR UPDATE`,
        [scrap.demand_id],
      );
      if (!sourceDemand) throw new ProductionDomainError('NOT_FOUND', '损耗来源需求不存在');
      requireSameVariantForMaterialLoss(
        String(scrap.material_variant_id),
        String(sourceDemand.material_variant_id),
      );
      await requireWorkOrderMaterialVariant(
        db,
        orderPolicy,
        sourceDemand.item_id,
        sourceDemand.material_variant_id,
        context.actorId!,
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
            quantityPerUnit: sourceDemand.quantity_per_unit_snapshot,
            unit: sourceDemand.unit_snapshot,
            plannedOutputQuantity: sourceDemand.planned_output_quantity_snapshot,
            needNumber: String(integerQuantity(scrap.scrap_number)),
            demandType: 'material_loss_supplement',
            parentDemandId: rootDemandId,
            supplementId: supplement.insertId,
          },
        ],
      });
      await writeInventoryAudit(
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
      if (scrap.loss_purpose !== 'replenishment')
        throw new ProductionDomainError('SCRAP_CANCEL_NOT_ALLOWED', '已确认的结案损坏登记不能取消');
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
      await writeInventoryAudit(
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

  private async findMaterialLossCandidates(db: Executor, batchId: string) {
    const [rows] = await db.query<MaterialLossCandidateRow[]>(
      `SELECT allocation.id allocation_id,allocation.demand_id,
        allocation.production_batch_id,allocation.item_id,allocation.material_variant_id,allocation.batch_id,
        item_batch.item_code_snapshot,${currentMaterialNameSql('item_batch.item_id')} item_name,item_batch.material_variant_code_snapshot,item_batch.batch_code,
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
}

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
  itemName: row.item_name,
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
  itemName: row.item_name,
  itemBatchId: String(row.batch_id),
  batchCode: row.batch_code,
  scrapScene: 'production_consumed',
  purpose: row.loss_purpose,
  closeoutId: row.closeout_id === null ? null : String(row.closeout_id),
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
