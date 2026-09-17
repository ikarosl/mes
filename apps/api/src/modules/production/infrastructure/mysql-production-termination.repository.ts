import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  BatchTerminationCheck,
  BatchTerminationImpact,
  BatchTerminationMaterial,
  BatchCloseoutApprovalSnapshot,
} from '@company/contracts';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionTerminationRepository } from '../application/ports/production-termination.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { fixedIntegerQuantity } from '../domain/integer-quantity.js';
import { allocationNeedsCloseoutSql } from './mysql-production-material.sql.js';
import { readCloseoutLossRecords } from './mysql-production-closeout-loss.read.js';
import { lastStepReportedQuantitySql } from './mysql-production-reporting.sql.js';
import {
  CLOSEOUT_APPROVAL_SNAPSHOT_SCHEMA_VERSION,
  readCloseoutApprovalSnapshot,
} from '../application/production-approval-snapshot.schema.js';

type Header = RowDataPacket &
  Omit<
    BatchTerminationCheck,
    | 'impacts'
    | 'materials'
    | 'lossRecords'
    | 'termination'
    | 'canTerminate'
    | 'blockers'
    | 'checkToken'
  >;
type Fact = RowDataPacket & {
  id: number;
  revision_no: number;
  approval_instance_id: number;
  available_quantity: string;
  extra_quantity: string;
  additional_scrap_quantity: string;
  existing_scrap_quantity: string;
  review_snapshot: BatchCloseoutApprovalSnapshot | string;
  created_by: number;
  created_at: Date;
};

@Injectable()
export class MysqlProductionTerminationRepository extends ProductionTerminationRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    super();
  }

  getCheck(batchId: string): Promise<BatchTerminationCheck> {
    return withTransaction(this.pool, (db) => this.loadCheck(db, batchId, false));
  }

  async loadCheck(
    db: PoolConnection,
    batchId: string,
    lock: boolean,
  ): Promise<BatchTerminationCheck> {
    const share = lock ? ' FOR SHARE' : '';
    const [[header]] = await db.query<Header[]>(
      `SELECT CAST(b.id AS CHAR) batchId,b.batch_no batchNo,b.status batchStatus,
       CAST(wo.id AS CHAR) workOrderId,wo.work_order_no workOrderNo,wo.order_type orderType,wo.status workOrderStatus,
       wo.product_code_snapshot productCode,wo.product_name_snapshot productName,wo.unit_snapshot unit,
       b.planned_quantity plannedQuantity,b.version,
       ${lastStepReportedQuantitySql('b.id', lock)} reportedNormalQuantity,
       COALESCE((SELECT SUM(s.scrap_quantity) FROM batch_step_scrap_records s WHERE s.production_batch_id=b.id${share}),0) existingScrapQuantity
       FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id WHERE b.id=?${lock ? ' FOR UPDATE' : ''}`,
      [batchId],
    );
    if (!header) throw new ProductionDomainError('NOT_FOUND', '生产批次不存在');
    const [[fact]] = await db.query<Fact[]>(
      `SELECT r.id,r.revision_no,r.approval_instance_id,r.available_quantity,r.extra_quantity,
       r.additional_scrap_quantity,r.existing_scrap_quantity,r.review_snapshot,r.created_by,r.created_at
       FROM production_batch_closeout c JOIN production_output_revision r
         ON r.id=c.current_revision_id AND r.closeout_id=c.id
       WHERE c.production_batch_id=?${share}`,
      [batchId],
    );
    if (fact) {
      const snapshot = readCloseoutApprovalSnapshot(
        typeof fact.review_snapshot === 'string'
          ? JSON.parse(fact.review_snapshot)
          : fact.review_snapshot,
        CLOSEOUT_APPROVAL_SNAPSHOT_SCHEMA_VERSION,
      );
      return {
        ...snapshot.check,
        ...header,
        canTerminate: false,
        blockers: ['本批次已结束'],
        termination: {
          id: String(fact.id),
          revisionNo: Number(fact.revision_no),
          approvalInstanceId: String(fact.approval_instance_id),
          availableQuantity: String(fact.available_quantity),
          extraQuantity: String(fact.extra_quantity),
          additionalScrapQuantity: String(fact.additional_scrap_quantity),
          existingScrapQuantity: String(fact.existing_scrap_quantity),
          reason: snapshot.output.reason,
          materialReviewNote: snapshot.output.materialReviewNote,
          createdBy: String(fact.created_by),
          createdAt: toBeijingISOString(fact.created_at),
        },
      };
    }
    const impacts: BatchTerminationImpact[] = [];
    const definitions = [
      [
        'step',
        'batch_step_records',
        'step_name_snapshot',
        'status',
        "status NOT IN ('completed','terminated')",
      ],
      [
        'abnormal',
        'batch_step_abnormal_dispositions',
        'disposition_no',
        'review_status',
        "review_status='pending_review'",
      ],
      ['rework', 'rework_records', 'rework_no', 'status', "status IN ('pending','doing')"],
      [
        'supplement',
        'production_material_supplement',
        'supplement_no',
        'status',
        "status='approved'",
      ],
      [
        'outbound',
        'outbound_order',
        'outbound_no',
        'status',
        "status NOT IN ('completed','cancelled')",
      ],
      [
        'allocation',
        'production_item_allocation',
        'CAST(id AS CHAR)',
        'allocation_status',
        allocationNeedsCloseoutSql('production_item_allocation', lock),
      ],
      [
        'demand',
        'production_item_demand',
        'item_code_snapshot',
        'business_status',
        "business_status='active'",
      ],
    ] as const;
    // SQL 标识符只来自本地封闭定义，所有业务值使用占位符。
    for (const [kind, table, label, status, condition] of definitions) {
      const quantity =
        kind === 'demand' ? 'remaining_number' : kind === 'allocation' ? 'assigned_number' : 'NULL';
      const unit = kind === 'demand' || kind === 'allocation' ? 'unit_snapshot' : 'NULL';
      const [rows] = await db.query<
        (RowDataPacket & {
          id: number;
          label: string;
          status: string;
          version: number;
          quantity: string | number | null;
          unit: string | null;
        })[]
      >(
        `SELECT id,${label} label,${status} status,version,${quantity} quantity,${unit} unit FROM ${table}
         WHERE production_batch_id=? AND ${condition} ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
        [batchId],
      );
      impacts.push(
        ...rows.map((row) => ({
          kind,
          id: String(row.id),
          label: row.label,
          status: row.status,
          version: row.version,
          quantity: row.quantity === null ? null : String(row.quantity),
          unit: row.unit,
        })),
      );
    }
    const materials = await this.materials(db, batchId, lock);
    const [losses] = await db.query<(RowDataPacket & { id: number })[]>(
      `SELECT id FROM item_scrap WHERE production_batch_id=? AND status='pending' ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
      [batchId],
    );
    const [pendingCorrections] = await db.query<(RowDataPacket & { id: number })[]>(
      `SELECT id FROM production_item_demand WHERE production_batch_id=? AND pending_correction_id IS NOT NULL${share}`,
      [batchId],
    );
    const [pendingReturns] = await db.query<(RowDataPacket & { return_no: string })[]>(
      `SELECT return_no FROM return_order WHERE production_batch_id=? AND status='pending'${share}`,
      [batchId],
    );
    const blockers: string[] = [];
    if (pendingReturns.length)
      blockers.push(
        '请在退料管理完成或取消待确认退料单：' +
          pendingReturns.map((row) => row.return_no).join('、'),
      );
    if (pendingCorrections.length) blockers.push('请先撤回或驳回在途需求更正，再开始批次收尾');
    if (
      !['material_partially_outbound', 'material_outbound', 'doing', 'closing'].includes(
        header.batchStatus,
      )
    )
      blockers.push('仅已实际领料或执行中的批次可结束；未领料批次请使用取消任务');
    if (!['released', 'doing'].includes(header.workOrderStatus))
      blockers.push('工单已不允许继续结束生产批次');
    if (impacts.some((row) => row.kind === 'allocation' && row.status !== 'active'))
      blockers.push('存在冻结或异常分配，请先核对并解除相关分配状态');
    if (losses.length) blockers.push('请先处理或取消待确认的物料损耗单，避免结束时新增补料');
    if (impacts.some((row) => row.kind === 'outbound' && row.status !== 'pending_picking'))
      blockers.push('存在不能自动取消的出库单，请先核对出库状态');
    const lossRecords = await readCloseoutLossRecords(db, batchId, lock);
    const evidence = { ...header, impacts, materials, lossRecords, blockers };
    return {
      ...evidence,
      checkToken: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
      canTerminate: blockers.length === 0,
      termination: null,
    };
  }

  private async materials(
    db: PoolConnection,
    batchId: string,
    lock: boolean,
  ): Promise<BatchTerminationMaterial[]> {
    const share = lock ? ' FOR SHARE' : '';
    const [rows] = await db.query<
      (RowDataPacket & Omit<BatchTerminationMaterial, 'returnableQuantity'>)[]
    >(
      `SELECT CAST(a.id AS CHAR) allocationId,ib.batch_code inventoryBatchCode,ib.item_code_snapshot itemCode,ib.material_variant_code_snapshot materialVariantCode,
       a.unit_snapshot unit,a.assigned_number assignedQuantity,
       COALESCE((SELECT SUM(d.outbound_number) FROM outbound_detail d JOIN outbound_order o ON o.id=d.outbound_id
         WHERE d.allocation_id=a.id AND o.status='completed'${share}),0) outboundQuantity,
       COALESCE((SELECT SUM(d.return_number) FROM return_detail d JOIN return_order o ON o.id=d.return_id
         WHERE d.allocation_id=a.id AND o.status IN ('pending','returned')${share}),0) returnQuantity,
       COALESCE((SELECT SUM(s.scrap_number) FROM item_scrap s WHERE s.allocation_id=a.id AND s.status IN ('pending','confirmed')${share}),0) lossQuantity
       FROM production_item_allocation a JOIN item_batch ib ON ib.id=a.batch_id WHERE a.production_batch_id=? ORDER BY a.id${lock ? ' FOR UPDATE' : ''}`,
      [batchId],
    );
    return rows.map((row) => ({
      ...row,
      returnableQuantity: fixedIntegerQuantity(
        Math.max(
          0,
          Number(row.outboundQuantity) - Number(row.returnQuantity) - Number(row.lossQuantity),
        ),
      ),
    }));
  }
}
