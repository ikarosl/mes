import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { RecordCloseoutMaterialLossPayload } from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { ProductionCloseoutMaterialLossRepository } from '../application/ports/production-closeout-material-loss.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { lockOutputBatch, requireOutputVersion } from './mysql-production-output.persistence.js';
import { MysqlProductionTerminationRepository } from './mysql-production-termination.repository.js';
import { businessNo, writeInventoryAudit } from './mysql-production-inventory.shared.js';

@Injectable()
export class MysqlProductionCloseoutMaterialLossRepository extends ProductionCloseoutMaterialLossRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly termination: MysqlProductionTerminationRepository,
  ) {
    super();
  }
  record(batchId: string, payload: RecordCloseoutMaterialLossPayload, context: CommandContext) {
    return withTransaction(this.pool, async (db) => {
      if (
        !context.actorId ||
        !payload.reason.trim() ||
        !Number.isSafeInteger(payload.scrapQuantity) ||
        payload.scrapQuantity <= 0 ||
        payload.scrapQuantity > 99_999_999
      )
        throw new ProductionDomainError('INVALID_INPUT', '请填写有效损坏数量、原因和操作人');
      const closeout = await lockOutputBatch(db, batchId);
      requireOutputVersion(closeout, payload.version);
      if (closeout.pending_approval_id !== null || closeout.current_revision_id !== null)
        throw new ProductionDomainError(
          'INVALID_STATE',
          '仅结案送审前可以登记损坏；已确认事实不能改量或撤销',
        );
      const check = await this.termination.loadCheck(db, batchId, true);
      if (check.batchStatus !== 'closing')
        throw new ProductionDomainError('INVALID_STATE', '任务尚未进入结案阶段');
      if (check.checkToken !== payload.checkToken)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '领料、退料或损耗事实已变化，请刷新核对',
        );
      const material = check.materials.find((row) => row.allocationId === payload.allocationId);
      if (!material || payload.scrapQuantity > Number(material.returnableQuantity))
        throw new ProductionDomainError(
          'SCRAP_QUANTITY_EXCEEDED',
          '损坏数量超过当前已领物料的剩余可登记上限',
        );
      // Closed demands and released allocations retain issued-material provenance.
      const [[source]] = await db.query<
        (RowDataPacket & {
          demand_id: number;
          item_id: number;
          material_variant_id: number;
          batch_id: number;
          unit_snapshot: string;
        })[]
      >(
        'SELECT demand_id,item_id,material_variant_id,batch_id,unit_snapshot FROM production_item_allocation WHERE id=? AND production_batch_id=? FOR UPDATE',
        [payload.allocationId, batchId],
      );
      if (!source) throw new ProductionDomainError('NOT_FOUND', '原领料分配不存在');
      const scrapNo = businessNo('SH');
      const [record] = await db.execute<ResultSetHeader>(
        `INSERT INTO item_scrap
        (scrap_no,production_batch_id,demand_id,allocation_id,item_id,material_variant_id,batch_id,scrap_scene,loss_purpose,closeout_id,
         scrap_number,unit_snapshot,reason_type,status,confirmed_by,confirmed_at,remark,created_by,updated_by)
        VALUES (?,?,?,?,?,?,?,'production_consumed','closeout_record',?,?,?,'closeout_damage','confirmed',?,NOW(),?,?,?)`,
        [
          scrapNo,
          batchId,
          source.demand_id,
          payload.allocationId,
          source.item_id,
          source.material_variant_id,
          source.batch_id,
          closeout.id,
          payload.scrapQuantity,
          source.unit_snapshot,
          context.actorId,
          payload.reason,
          context.actorId,
          context.actorId,
        ],
      );
      await db.execute(
        'UPDATE production_batch_closeout SET version=version+1,updated_by=? WHERE id=?',
        [context.actorId, closeout.id],
      );
      const result = { closeoutId: String(closeout.id), batchId, scrapId: String(record.insertId) };
      await writeInventoryAudit(
        db,
        context,
        'production-closeout-material-loss.record',
        'item_scrap',
        result.scrapId,
        { allocationId: payload.allocationId, returnableQuantity: material.returnableQuantity },
        {
          ...result,
          scrapNo,
          purpose: 'closeout_record',
          status: 'confirmed',
          allocationId: payload.allocationId,
          scrapQuantity: payload.scrapQuantity,
          reason: payload.reason,
          returnableQuantity: Number(material.returnableQuantity) - payload.scrapQuantity,
        },
      );
      return result;
    });
  }
}
