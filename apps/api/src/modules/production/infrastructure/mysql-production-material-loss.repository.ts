import { Inject, Injectable } from '@nestjs/common';
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
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity } from '../domain/integer-quantity.js';
import { requireMaterialLossSourceVariant } from '../domain/production-material-requirement.policy.js';
import { findBatch } from './mysql-production.shared.js';
import { lockWorkOrderForBatch } from './mysql-work-order-material-version.js';
import { ProductionMaterialLossRepository } from '../application/ports/production-material-loss.repository.js';
import {
  decimal,
  businessNo,
  requireVersion,
  requireAffected,
  lockIds,
  writeInventoryAudit,
} from './mysql-production-inventory.shared.js';

import {
  listMaterialLossDisplay,
  readMaterialLossDisplay,
  readMaterialLossBatchDisplays,
  requireMaterialLossBatchDisplay,
  type MaterialLossBatchDisplay,
} from './queries/material-loss-display.query.js';

type Executor = Pool | PoolConnection;

type MaterialLossCandidateRow = RowDataPacket & {
  allocation_id: number;
  demand_id: number;
  production_batch_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  unit_snapshot: string;
  confirmed_quantity: string;
  occupied_quantity: string;
  occupied_return_quantity: string;
  occupied_loss_quantity: string;
};

type MaterialLossCommandRow = RowDataPacket & {
  id: number;
  scrap_no: string;
  production_batch_id: number;
  allocation_id: number;
  demand_id: number;
  item_id: number;
  material_variant_id: number;
  batch_id: number;
  scrap_number: string;
  unit_snapshot: string;
  reason_type: string;
  loss_purpose: MaterialLossItem['purpose'];
  status: MaterialLossItem['status'];
  version: number;
  remark: string | null;
};

@Injectable()
export class MysqlProductionMaterialLossRepository extends ProductionMaterialLossRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  async listMaterialLosses(query: MaterialLossQuery): Promise<PageResult<MaterialLossItem>> {
    return listMaterialLossDisplay(this.pool, query);
  }

  async getMaterialLoss(scrapId: string): Promise<MaterialLossItem> {
    return readMaterialLossDisplay(this.pool, scrapId);
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
    const displays = await readMaterialLossBatchDisplays(
      this.pool,
      rows.map((row) => String(row.batch_id)),
    );
    return rows
      .filter((row) => materialLossAvailable(row) > 0)
      .map((row) =>
        mapMaterialLossCandidate(
          row,
          requireMaterialLossBatchDisplay(displays, String(row.batch_id)),
        ),
      );
  }

  async createMaterialLoss(payload: CreateMaterialLossPayload, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      await lockWorkOrderForBatch(db, payload.productionBatchId);
      const batch = await findBatch(db, payload.productionBatchId, true);
      if (!['material_partially_outbound', 'material_outbound', 'doing'].includes(batch.status))
        throw new ProductionDomainError('INVALID_STATE', '任务已停止生产，请通过结案登记物料损坏');
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
         VALUES (?,?,?,?,?,?,?,'production_consumed','production_record',?,?,?,'pending',?,?,?)`,
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
          purpose: 'production_record',
        },
      );
      return readMaterialLossDisplay(db, scrapId);
    });
  }

  async confirmMaterialLoss(scrapId: string, version: number, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      const [[identity]] = await db.query<(RowDataPacket & { production_batch_id: number })[]>(
        'SELECT production_batch_id FROM item_scrap WHERE id=?',
        [scrapId],
      );
      if (!identity) throw new ProductionDomainError('NOT_FOUND', '损耗记录不存在');
      await lockWorkOrderForBatch(db, String(identity.production_batch_id));
      await findBatch(db, String(identity.production_batch_id), true);
      const scrap = await this.findMaterialLoss(db, scrapId, true);
      if (scrap.loss_purpose !== 'production_record')
        throw new ProductionDomainError(
          'SCRAP_CONFIRM_NOT_ALLOWED',
          '结案损坏登记已确认且不补料，不能使用在产损耗确认',
        );
      if (scrap.status === 'confirmed') return readMaterialLossDisplay(db, scrapId);
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
      requireMaterialLossSourceVariant(
        String(scrap.material_variant_id),
        String(candidate.material_variant_id),
      );
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE item_scrap SET status='confirmed',confirmed_by=?,confirmed_at=NOW(),
         updated_by=?,version=version+1 WHERE id=? AND status='pending' AND version=?`,
        [context.actorId, context.actorId, scrapId, version],
      );
      requireAffected(updated, '损耗记录');

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
          purpose: scrap.loss_purpose,
          scrapQuantity: String(scrap.scrap_number),
        },
      );
      return readMaterialLossDisplay(db, scrapId);
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
      if (scrap.loss_purpose !== 'production_record')
        throw new ProductionDomainError('SCRAP_CANCEL_NOT_ALLOWED', '已确认的结案损坏登记不能取消');
      if (scrap.status === 'cancelled') return readMaterialLossDisplay(db, scrapId);
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
      return readMaterialLossDisplay(db, scrapId);
    });
  }

  private async findMaterialLossCandidates(db: Executor, batchId: string) {
    const [rows] = await db.query<MaterialLossCandidateRow[]>(
      `SELECT allocation.id allocation_id,allocation.demand_id,
        allocation.production_batch_id,allocation.item_id,allocation.material_variant_id,allocation.batch_id,
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
    const [[row]] = await db.query<MaterialLossCommandRow[]>(
      `SELECT id,scrap_no,production_batch_id,allocation_id,demand_id,item_id,
        material_variant_id,batch_id,scrap_number,unit_snapshot,reason_type,loss_purpose,status,version,remark
       FROM item_scrap WHERE id=?`,
      [id],
    );
    if (!row) throw new ProductionDomainError('NOT_FOUND', '生产领料损耗记录不存在');
    return row;
  }
}

const materialLossAvailable = (row: MaterialLossCandidateRow) =>
  integerQuantity(row.confirmed_quantity) -
  integerQuantity(row.occupied_return_quantity) -
  integerQuantity(row.occupied_loss_quantity);

const mapMaterialLossCandidate = (
  row: MaterialLossCandidateRow,
  display: MaterialLossBatchDisplay,
): MaterialLossCandidateItem => ({
  allocationId: String(row.allocation_id),
  demandId: String(row.demand_id),
  itemId: String(row.item_id),
  materialVariantId: String(row.material_variant_id),
  materialVariantCode: display.materialVariantCode,
  itemCode: display.itemCode,
  itemName: display.itemName,
  itemBatchId: String(row.batch_id),
  batchCode: display.batchCode,
  confirmedOutboundQuantity: String(row.confirmed_quantity),
  occupiedReturnQuantity: String(row.occupied_return_quantity),
  occupiedLossQuantity: String(row.occupied_loss_quantity),
  availableLossQuantity: decimal(Math.max(0, materialLossAvailable(row))),
  unit: row.unit_snapshot,
});
