import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@company/database';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  SaveWorkOrderMaterialConfigurationPayload,
  SaveWorkOrderMaterialConfigurationResult,
  WorkOrderMaterialConfiguration,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { MaterialVariantQuery, ProductSnapshotQuery } from '../../product/public.js';
import { WorkOrderMaterialConfigurationRepository } from '../application/ports/work-order-material-configuration.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { findWorkOrder } from './mysql-production.shared.js';

type SelectionRow = RowDataPacket & { material_id: number; material_variant_id: number };
type BlockingBatch = NonNullable<WorkOrderMaterialConfiguration['blockingBatch']>;

@Injectable()
export class MysqlWorkOrderMaterialConfigurationRepository extends WorkOrderMaterialConfigurationRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly products: ProductSnapshotQuery,
    private readonly variants: MaterialVariantQuery,
  ) {
    super();
  }

  async get(workOrderId: string): Promise<WorkOrderMaterialConfiguration> {
    return withTransaction(this.pool, async (db) => {
      const order = await findWorkOrder(db, workOrderId, true);
      this.requireMassOrder(order.order_type);
      const blockingBatch = await this.blockingBatch(db, workOrderId);
      const bom = await this.products.getApprovedBomSnapshot(String(order.product_id));
      const blockedReason = !['released', 'doing'].includes(order.status)
        ? '只有已下达或生产中的批量工单可以配置物料版本'
        : blockingBatch
          ? `任务 ${blockingBatch.batchNo} 已生成需求，仍限制工单换版；正常完工历史也继续限制`
          : bom.status !== 'success'
            ? bom.message
            : null;
      const result: WorkOrderMaterialConfiguration = {
        workOrderId,
        workOrderNo: order.work_order_no,
        version: order.version,
        canConfigure: blockedReason === null,
        blockedReason,
        blockingBatch,
        lines: [],
      };
      if (bom.status !== 'success') return result;
      const choices = await this.selections(db, workOrderId);
      const enabled = await this.variants.listEnabledByMaterials(
        bom.value.lines.map((line) => line.materialId),
      );
      const references = await this.variants.listDisplayReferencesByIds(
        choices.map((row) => String(row.material_variant_id)),
      );
      result.lines = bom.value.lines.map((line) => {
        const selected = choices.find((row) => String(row.material_id) === line.materialId);
        const selectedId = selected ? String(selected.material_variant_id) : null;
        return {
          materialId: line.materialId,
          materialCode: line.itemCode,
          materialName: line.productName,
          unit: line.unit,
          quantityPerUnit: line.quantityPerUnit,
          materialVariantId: selectedId,
          materialVariantCode:
            references.find((reference) => reference.id === selectedId)?.variantCode ?? null,
          variants: enabled
            .filter((variant) => variant.materialId === line.materialId)
            .map((variant) => ({
              materialVariantId: variant.id,
              materialVariantCode: variant.variantCode,
              majorVersion: variant.majorVersion,
              minorVersion: variant.minorVersion,
              selectedQuantity: null,
              status: variant.status,
            })),
        };
      });
      return result;
    });
  }

  async save(
    workOrderId: string,
    payload: SaveWorkOrderMaterialConfigurationPayload,
    context: CommandContext,
  ): Promise<SaveWorkOrderMaterialConfigurationResult> {
    if (!context.actorId || !payload.reason.trim())
      throw new ProductionDomainError('INVALID_INPUT', '请填写配置原因并确认当前操作人');
    return withTransaction(this.pool, async (db) => {
      const order = await findWorkOrder(db, workOrderId, true);
      this.requireMassOrder(order.order_type);
      if (!['released', 'doing'].includes(order.status))
        throw new ProductionDomainError(
          'INVALID_STATE',
          '只有已下达或生产中的批量工单可以配置物料版本',
        );
      if (order.version !== payload.version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '工单已变化，请重新加载物料配置',
        );
      const blocker = await this.blockingBatch(db, workOrderId);
      if (blocker)
        throw new ProductionDomainError(
          'INVALID_STATE',
          `任务 ${blocker.batchNo} 已生成需求，不能修改工单物料版本`,
          { blockingBatch: blocker },
        );
      const bom = await this.products.getApprovedBomSnapshot(String(order.product_id));
      if (bom.status !== 'success')
        throw new ProductionDomainError(
          bom.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
          bom.message,
        );
      const selections = new Map(
        payload.selections.map((line) => [line.materialId, line.materialVariantId]),
      );
      if (
        selections.size !== payload.selections.length ||
        selections.size !== bom.value.lines.length ||
        bom.value.lines.some((line) => !selections.has(line.materialId))
      )
        throw new ProductionDomainError(
          'INVALID_INPUT',
          '必须完整配置 BOM 中的每种基础物料，且不能重复',
        );
      const enabled = await this.variants.listEnabledByMaterials([...selections.keys()], {
        lock: true,
      });
      for (const [materialId, variantId] of selections) {
        if (
          !enabled.some((variant) => variant.id === variantId && variant.materialId === materialId)
        )
          throw new ProductionDomainError('INVALID_INPUT', '只能选择对应基础物料下的启用精确版本');
      }
      const before = await this.selections(db, workOrderId);
      // BOM 已批准且不可变，保存整份配置只插入缺项或更新原行，不删除历史需求和物流事实。
      for (const [materialId, variantId] of selections) {
        const previous = before.find((line) => String(line.material_id) === materialId);
        if (!previous) {
          await db.execute(
            'INSERT INTO work_order_material_versions (work_order_id,material_id,material_variant_id,created_by,updated_by) VALUES (?,?,?,?,?)',
            [workOrderId, materialId, variantId, context.actorId, context.actorId],
          );
        } else if (String(previous.material_variant_id) !== variantId) {
          await db.execute(
            'UPDATE work_order_material_versions SET material_variant_id=?,updated_by=?,updated_at=NOW(),version=version+1 WHERE work_order_id=? AND material_id=?',
            [variantId, context.actorId, workOrderId, materialId],
          );
        }
      }
      const [updated] = await db.execute<ResultSetHeader>(
        'UPDATE work_orders SET version=version+1,updated_by=? WHERE id=? AND version=?',
        [context.actorId, workOrderId, payload.version],
      );
      if (updated.affectedRows !== 1)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '工单已变化，请重新加载物料配置',
        );
      const result = { workOrderId, version: payload.version + 1 };
      await writeTransactionalAudit(db, {
        logType: 'business',
        module: 'production',
        action: 'work-order.material-configuration.save',
        userId: context.actorId,
        targetType: 'work_orders',
        targetId: workOrderId,
        result: 'success',
        beforeData: {
          version: payload.version,
          selections: before.map((line) => ({
            materialId: String(line.material_id),
            materialVariantId: String(line.material_variant_id),
          })),
        },
        afterData: { ...result, selections: payload.selections, reason: payload.reason.trim() },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return result;
    });
  }

  private requireMassOrder(orderType: string): void {
    if (orderType !== 'mass_production')
      throw new ProductionDomainError(
        'INVALID_INPUT',
        '研发工单按任务选择版本，不使用工单物料版本配置',
      );
  }

  private async selections(db: PoolConnection, workOrderId: string): Promise<SelectionRow[]> {
    const [rows] = await db.query<SelectionRow[]>(
      'SELECT material_id,material_variant_id FROM work_order_material_versions WHERE work_order_id=? ORDER BY material_id FOR UPDATE',
      [workOrderId],
    );
    return rows;
  }

  private async blockingBatch(
    db: PoolConnection,
    workOrderId: string,
  ): Promise<BlockingBatch | null> {
    const [[row]] = await db.query<
      (RowDataPacket & { id: number; batch_no: string; status: BlockingBatch['status'] })[]
    >(
      `SELECT b.id,b.batch_no,b.status FROM production_batches b
       WHERE b.work_order_id=? AND b.status NOT IN ('cancelled','terminated')
       AND EXISTS (SELECT 1 FROM production_item_demand d WHERE d.production_batch_id=b.id FOR SHARE)
       ORDER BY b.id LIMIT 1 FOR UPDATE`,
      [workOrderId],
    );
    return row ? { id: String(row.id), batchNo: row.batch_no, status: row.status } : null;
  }
}
