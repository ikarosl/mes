import { Inject, Injectable } from '@nestjs/common';
import { QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS } from '@company/constants';
import { withTransaction } from '@company/database';
import type {
  ChangeQualityIncomingInspectionAssociationsPayload,
  CreateQualityIncomingInspectionOrderPayload,
  QualityIncomingInspectionInitialReceipt,
  UpdateQualityIncomingInspectionOrderPayload,
} from '@company/contracts';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { QualityIncomingInspectionOrderCommand } from '../../quality/public.js';
import { IncomingInspectionOrderRepository } from '../application/ports/incoming-inspection-order.repository.js';
import { ProcurementDomainError } from '../domain/procurement.errors.js';
import { sortedIds } from './mysql-purchase-order.shared.js';

@Injectable()
export class MysqlIncomingInspectionOrderRepository extends IncomingInspectionOrderRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly quality: QualityIncomingInspectionOrderCommand,
  ) {
    super();
  }

  create(payload: CreateQualityIncomingInspectionOrderPayload, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      await lockSources(db, payload.receipts);
      return this.quality.create(payload, context);
    });
  }

  changeAssociations(
    payload: ChangeQualityIncomingInspectionAssociationsPayload,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, async (db) => {
      await lockSources(db, payload.changes);
      return this.quality.changeAssociations(payload, context);
    });
  }

  updateRemark(
    id: string,
    payload: UpdateQualityIncomingInspectionOrderPayload,
    context: CommandContext,
  ) {
    return withTransaction(this.pool, () => this.quality.updateRemark(id, payload, context));
  }
}

async function lockSources(
  db: PoolConnection,
  sources: readonly QualityIncomingInspectionInitialReceipt[],
) {
  if (
    !Array.isArray(sources) ||
    sources.length < 1 ||
    sources.length > QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS
  )
    throw new ProcurementDomainError(
      'INVALID_RECEIPT',
      `一次请选择 1～${QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS} 张到货`,
    );
  if (
    sources.some(
      (source) =>
        source == null ||
        typeof source.receiptId !== 'string' ||
        !/^[1-9]\d{0,19}$/.test(source.receiptId),
    ) ||
    new Set(sources.map((source) => source.receiptId)).size !== sources.length
  )
    throw new ProcurementDomainError('INVALID_RECEIPT', '到货标识不正确或重复');
  const byId = new Map(sources.map((source) => [source.receiptId, source]));
  // Only receipt headers are locked. Never acquire purchase roots, lines, rounds or cases from a grouping command.
  for (const id of sortedIds([...byId.keys()])) {
    const [[receipt]] = await db.query<(RowDataPacket & { id: string; is_voided: number })[]>(
      'SELECT id,is_voided FROM procurement_receipt WHERE id=? FOR UPDATE',
      [id],
    );
    if (!receipt) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货单不存在');
    if (Number(receipt.is_voided) === 1 && byId.get(id)!.fromOrderId === null)
      throw new ProcurementDomainError('RECEIPT_STATE', '未关联且已作废的到货不能新增关联');
  }
}
