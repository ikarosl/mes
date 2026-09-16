import { currentMaterialNameSql } from './queries/material-name.sql.js';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DEMAND_GENERATION_GROUP_TYPE } from '@company/constants';
import { withTransaction } from '@company/database';
import type {
  MaterialDemandManagementDemand,
  MaterialDemandManagementPage,
  MaterialDemandManagementQuery,
  MaterialDemandManagementRow,
  MaterialDemandManagementVariant,
  DemandType,
  DemandBusinessStatus,
} from '@company/contracts';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  MaterialVariantQuery,
  ProductSnapshotQuery,
  type ProductBomSnapshot,
} from '../../product/public.js';
import {
  ProductionMaterialDemandConfigurationRepository,
  type AddManualMaterialDemandCommand,
  type ConfigureMaterialRequirementCommand,
} from '../application/ports/production-material-demand-configuration.repository.js';
import { requireCompleteNormalDemandSplit } from '../domain/production-material-requirement.policy.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { integerQuantity, multiplyIntegerQuantities } from '../domain/integer-quantity.js';
import {
  mysqlProductionDemandPlanWriter,
  type DemandPlanLine,
} from './mysql-production-demand-plan.writer.js';
import {
  lockWorkOrderForBatch,
  requireWorkOrderMaterialVariant,
} from './mysql-work-order-material-version.js';
import { findBatch } from './mysql-production.shared.js';

type BatchManagementRow = RowDataPacket & {
  id: number;
  batch_no: string;
  work_order_no: string;
  order_type: MaterialDemandManagementRow['orderType'];
  product_id: number;
  planned_quantity: string;
  status: string;
};

type BasisRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  product_material_id: number;
  material_id: number;
  material_code_snapshot: string;
  material_name: string;
  unit_snapshot: string;
  quantity_per_unit_snapshot: string;
  planned_output_quantity_snapshot: string;
  required_number: string;
};

type DemandRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  requirement_basis_id: number;
  product_material_id: number;
  item_id: number;
  material_variant_id: number;
  material_variant_code_snapshot: string;
  need_number: string;
  remaining_number: string;
  demand_type: DemandType;
  parent_demand_id: number | null;
  business_status: DemandBusinessStatus;
};

type WorkOrderVariantLockRow = RowDataPacket & {
  production_batch_id: number;
  material_id: number;
  material_variant_id: number;
};

/**
 * Production owns demand facts but not Product's BOM/version master. The adapter
 * validates BOM/version choices through Product's public boundary and writes the
 * immutable requirement basis plus exact demand facts in one local transaction.
 * Display names use the registered read-only material-name SQL fragment.
 *
 * The management projection only returns demand configuration data. Inventory
 * is intentionally not queried while an administrator is editing a split.
 */
@Injectable()
export class MysqlProductionMaterialDemandConfigurationRepository extends ProductionMaterialDemandConfigurationRepository {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly products: ProductSnapshotQuery,
    private readonly materialVariants: MaterialVariantQuery,
  ) {
    super();
  }

  async listManagement(
    query: MaterialDemandManagementQuery,
  ): Promise<MaterialDemandManagementPage> {
    const batches = await this.listBatches(query);
    if (batches.length === 0)
      return {
        items: [],
        total: 0,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      };

    const batchIds = batches.map((batch) => String(batch.id));
    const [basisRows] = await this.pool.query<BasisRow[]>(
      `SELECT id,production_batch_id,product_material_id,material_id,
          material_code_snapshot,${currentMaterialNameSql('production_material_requirement_basis.material_id')} material_name,unit_snapshot,
          quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number
       FROM production_material_requirement_basis
       WHERE production_batch_id IN (${placeholders(batchIds)})
       ORDER BY production_batch_id,id`,
      batchIds,
    );
    const [demandRows] = await this.pool.query<DemandRow[]>(
      `SELECT id,production_batch_id,requirement_basis_id,product_material_id,item_id,
          material_variant_id,material_variant_code_snapshot,need_number,remaining_number,
          demand_type,parent_demand_id,business_status
       FROM production_item_demand
       WHERE production_batch_id IN (${placeholders(batchIds)})
       ORDER BY production_batch_id,requirement_basis_id,id`,
      batchIds,
    );
    const basisByBatch = groupBy(basisRows, (row) => String(row.production_batch_id));
    const boms = new Map<string, ProductBomSnapshot>();
    for (const batch of batches) {
      // Once a batch has left pending, its requirement basis is the complete,
      // immutable BOM snapshot. Historical demand management must not fail or
      // lose frozen quantities merely because current Product data was disabled.
      // Material names are a current display projection, never part of the frozen formula.
      if (batch.status !== 'pending') continue;
      const result = await this.products.getBomSnapshot(String(batch.product_id));
      if (result.status === 'success') boms.set(String(batch.id), result.value);
    }
    const materialIds = [
      ...new Set([
        ...basisRows.map((basis) => String(basis.material_id)),
        ...[...boms.values()].flatMap((bom) => bom.lines.map((line) => line.materialId)),
      ]),
    ];
    // The management page is a selectable-candidate surface: only enabled
    // variants are returned. Historical disabled variants remain visible through
    // the demand snapshot itself, but can never be selected again.
    const allVariants = await this.materialVariants.listEnabledByMaterials(materialIds);
    const [lockRows] = await this.pool.query<WorkOrderVariantLockRow[]>(
      `SELECT b.id production_batch_id,lock_row.material_id,lock_row.material_variant_id
       FROM production_batches b
       JOIN work_order_material_versions lock_row ON lock_row.work_order_id=b.work_order_id
       WHERE b.id IN (${placeholders(batchIds)})`,
      batchIds,
    );
    const lockedVariantByBatchMaterial = new Map(
      lockRows.map((row) => [
        `${row.production_batch_id}:${row.material_id}`,
        String(row.material_variant_id),
      ]),
    );
    const demandByBasis = groupBy(demandRows, (row) => String(row.requirement_basis_id));
    const variantByMaterial = groupBy(allVariants, (variant) => variant.materialId);
    const rows: MaterialDemandManagementRow[] = [];
    for (const batch of batches) {
      const existingBasis = basisByBatch.get(String(batch.id)) ?? [];
      const basisByProductMaterial = new Map(
        existingBasis.map((basis) => [String(basis.product_material_id), basis]),
      );
      const bom = boms.get(String(batch.id));
      const currentLines = bom?.lines ?? [];
      const currentLineIds = new Set(currentLines.map((line) => line.productMaterialId));
      const frozenOnlyLines: ProductBomSnapshot['lines'] = existingBasis
        .filter((basis) => !currentLineIds.has(String(basis.product_material_id)))
        .map((basis) => ({
          productMaterialId: String(basis.product_material_id),
          materialId: String(basis.material_id),
          itemCode: basis.material_code_snapshot,
          productName: basis.material_name,
          unit: basis.unit_snapshot,
          quantityPerUnit: basis.quantity_per_unit_snapshot,
        }));
      for (const line of [...currentLines, ...frozenOnlyLines]) {
        const basis = basisByProductMaterial.get(line.productMaterialId);
        const basisId = basis?.id ? String(basis.id) : `${batch.id}:${line.productMaterialId}`;
        const requiredQuantity =
          basis?.required_number ??
          multiplyIntegerQuantities(line.quantityPerUnit, batch.planned_quantity);
        const materialId = basis ? String(basis.material_id) : line.materialId;
        const normalDemands = (demandByBasis.get(String(basis?.id ?? '')) ?? []).filter(
          (demand) => demand.demand_type === 'normal',
        );
        const configuredQuantity = normalDemands.reduce(
          (total, demand) => total + integerQuantity(demand.need_number),
          0,
        );
        const variants: MaterialDemandManagementVariant[] = (
          variantByMaterial.get(materialId) ?? []
        ).map((variant) => ({
          materialVariantId: variant.id,
          materialVariantCode: variant.variantCode,
          majorVersion: variant.majorVersion,
          minorVersion: variant.minorVersion,
          selectedQuantity:
            normalDemands.find((demand) => String(demand.material_variant_id) === variant.id)
              ?.need_number ?? null,
          status: variant.status,
        }));
        const demands: MaterialDemandManagementDemand[] = (
          demandByBasis.get(String(basis?.id ?? '')) ?? []
        ).map((demand) => ({
          demandId: String(demand.id),
          materialVariantId: String(demand.material_variant_id),
          materialVariantCode: demand.material_variant_code_snapshot,
          demandQuantity: demand.need_number,
          remainingQuantity: demand.remaining_number,
          demandType: demand.demand_type,
          parentDemandId: demand.parent_demand_id === null ? null : String(demand.parent_demand_id),
          businessStatus: demand.business_status,
        }));
        rows.push({
          id: basisId,
          productionBatchId: String(batch.id),
          batchNo: batch.batch_no,
          workOrderNo: batch.work_order_no,
          orderType: batch.order_type,
          requirementBasisId: basis ? String(basis.id) : null,
          productMaterialId: line.productMaterialId,
          materialId: materialId,
          materialCode: basis?.material_code_snapshot ?? line.itemCode,
          materialName: basis?.material_name ?? line.productName,
          unit: basis?.unit_snapshot ?? line.unit,
          requiredQuantity,
          configuredQuantity: `${configuredQuantity}.0000`,
          lockedMaterialVariantId:
            lockedVariantByBatchMaterial.get(`${batch.id}:${materialId}`) ?? null,
          status: normalDemands.length > 0 ? 'configured' : 'pending',
          demands,
          variants,
        });
      }
    }
    const filtered = rows.filter((row) => {
      if (query.status && row.status !== query.status) return false;
      if (!query.keyword?.trim()) return true;
      const keyword = query.keyword.trim().toLowerCase();
      return [row.batchNo, row.workOrderNo, row.materialCode, row.materialName].some((value) =>
        value.toLowerCase().includes(keyword),
      );
    });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async configureNormalDemands(
    productionBatchId: string,
    requirements: ConfigureMaterialRequirementCommand[],
    context: CommandContext,
  ): Promise<void> {
    if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
    await withTransaction(this.pool, async (db) => {
      const orderPolicy = await lockWorkOrderForBatch(db, productionBatchId);
      const batch = await findBatch(db, productionBatchId, true);
      if (batch.status !== 'pending')
        throw new ProductionDomainError('INVALID_STATE', '只有待配置生产批次可以确认版本需求');

      // This is deliberately repeated inside the local transaction. The Product
      // public query reuses the active connection, so the BOM and exact-version
      // status used to write facts are the same snapshot as the locked batch.
      const bomResult = await this.products.getBomSnapshot(String(batch.product_id));
      if (bomResult.status !== 'success')
        throw new ProductionDomainError(
          bomResult.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
          bomResult.message,
        );
      const bom = bomResult.value;
      const variants = await this.materialVariants.listEnabledByMaterials(
        bom.lines.map((line) => line.materialId),
        { lock: true },
      );
      const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
      const requirementsByLine = new Map(
        requirements.map((requirement) => [requirement.productMaterialId, requirement]),
      );
      if (
        requirements.length !== bom.lines.length ||
        requirements.length !== requirementsByLine.size ||
        bom.lines.some((line) => !requirementsByLine.has(line.productMaterialId))
      )
        throw new ProductionDomainError('INVALID_INPUT', '必须一次完整配置全部基础 BOM 明细');
      for (const requirement of requirements) {
        const line = bom.lines.find(
          (candidate) => candidate.productMaterialId === requirement.productMaterialId,
        );
        if (!line) throw new ProductionDomainError('INVALID_INPUT', '基础 BOM 明细不存在或已变化');
        const required = integerQuantity(
          multiplyIntegerQuantities(line.quantityPerUnit, batch.planned_quantity),
        );
        requireCompleteNormalDemandSplit(required, requirement.splits);
        if (orderPolicy.orderType === 'mass_production' && requirement.splits.length !== 1)
          throw new ProductionDomainError(
            'INVALID_INPUT',
            '批量生产工单的同一基础物料只能选择一个版本',
          );
        for (const split of requirement.splits) {
          const variant = variantsById.get(split.materialVariantId);
          if (!variant || variant.materialId !== line.materialId)
            throw new ProductionDomainError('INVALID_INPUT', '只能选择对应基础物料下的启用版本');
          await requireWorkOrderMaterialVariant(
            db,
            orderPolicy,
            line.materialId,
            split.materialVariantId,
            context.actorId!,
          );
        }
      }
      const [existingBasisRows] = await db.query<
        (RowDataPacket & { product_material_id: number })[]
      >(
        'SELECT product_material_id FROM production_material_requirement_basis WHERE production_batch_id=? FOR UPDATE',
        [productionBatchId],
      );
      const existingBasis = new Set(
        existingBasisRows.map((row) => String(row.product_material_id)),
      );
      if (existingBasis.size > 0)
        throw new ProductionDomainError('CONFLICT', '该任务已经开始配置物料需求，不能重复确认');
      const demandLines = [] as Array<{
        identityId: string;
        requirementBasisId: string;
        productMaterialId: string;
        itemId: string;
        materialVariantId: string;
        materialVariantCode: string;
        itemCode: string;
        quantityPerUnit: string;
        unit: string;
        plannedOutputQuantity: string;
        needNumber: string;
        demandType: 'normal';
      }>;
      for (const requirement of requirements) {
        const line = bom.lines.find(
          (candidate) => candidate.productMaterialId === requirement.productMaterialId,
        )!;
        const [basis] = await db.execute<ResultSetHeader>(
          `INSERT INTO production_material_requirement_basis
           (production_batch_id,product_material_id,material_id,material_code_snapshot,
            unit_snapshot,quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number,created_by)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            productionBatchId,
            line.productMaterialId,
            line.materialId,
            line.itemCode,
            line.unit,
            line.quantityPerUnit,
            batch.planned_quantity,
            multiplyIntegerQuantities(line.quantityPerUnit, batch.planned_quantity),
            context.actorId,
          ],
        );
        for (const split of requirement.splits) {
          const variant = variantsById.get(split.materialVariantId)!;
          demandLines.push({
            identityId: `${basis.insertId}:${variant.id}`,
            requirementBasisId: String(basis.insertId),
            productMaterialId: line.productMaterialId,
            itemId: line.materialId,
            materialVariantId: variant.id,
            materialVariantCode: variant.variantCode,
            itemCode: line.itemCode,
            quantityPerUnit: line.quantityPerUnit,
            unit: line.unit,
            plannedOutputQuantity: batch.planned_quantity,
            needNumber: `${split.quantity}.0000`,
            demandType: 'normal',
          });
        }
      }
      await mysqlProductionDemandPlanWriter.createDemandGroup(db, {
        batchId: productionBatchId,
        actorId: context.actorId,
        source: { type: DEMAND_GENERATION_GROUP_TYPE.normal, productionBatchId },
        expectedBatchVersion: batch.version,
        transitionToMaterialPending: true,
        lines: demandLines,
      });
      await writeTransactionalAudit(db, {
        logType: 'business',
        module: 'production',
        action: 'production-material-demand.configure-normal',
        userId: context.actorId,
        targetId: productionBatchId,
        targetType: 'production_batches',
        result: 'success',
        beforeData: { status: batch.status, version: batch.version },
        afterData: {
          status: 'material_pending',
          demandCount: demandLines.length,
        },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
    });
  }

  async addManualDemand(
    command: AddManualMaterialDemandCommand,
    context: CommandContext,
  ): Promise<{ additionId: string; additionNo: string; demandIds: string[] }> {
    if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
    return withTransaction(this.pool, async (db) => {
      const reason = command.reason.trim();
      if (!reason) throw new ProductionDomainError('INVALID_INPUT', '人工追加原因不能为空');
      const orderPolicy = await lockWorkOrderForBatch(db, command.productionBatchId);
      const batch = await findBatch(db, command.productionBatchId, true);
      if (['pending', 'cancelled', 'completed', 'terminated', 'closing'].includes(batch.status))
        throw new ProductionDomainError(
          'INVALID_STATE',
          '只有已生成初始需求的进行中任务可以人工追加',
        );
      const [basisRows] = await db.query<BasisRow[]>(
        `SELECT id,production_batch_id,product_material_id,material_id,
            material_code_snapshot,${currentMaterialNameSql('production_material_requirement_basis.material_id')} material_name,unit_snapshot,
            quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number
         FROM production_material_requirement_basis WHERE production_batch_id=? FOR UPDATE`,
        [command.productionBatchId],
      );
      const basisByProductMaterial = new Map(
        basisRows.map((basis) => [String(basis.product_material_id), basis]),
      );
      const requirementByLine = new Map(
        command.requirements.map((requirement) => [requirement.productMaterialId, requirement]),
      );
      if (
        command.requirements.length === 0 ||
        command.requirements.length !== requirementByLine.size
      )
        throw new ProductionDomainError(
          'INVALID_INPUT',
          '人工追加至少需要一种且不能重复选择基础物料',
        );
      const materialIds = command.requirements.map((requirement) => {
        const basis = basisByProductMaterial.get(requirement.productMaterialId);
        if (!basis)
          throw new ProductionDomainError('INVALID_INPUT', '人工追加物料不属于任务冻结 BOM');
        return String(basis.material_id);
      });
      const variants = await this.materialVariants.listEnabledByMaterials(materialIds, {
        lock: true,
      });
      const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
      const lines: DemandPlanLine[] = [];
      for (const requirement of command.requirements) {
        const basis = basisByProductMaterial.get(requirement.productMaterialId)!;
        const splitIds = new Set(requirement.splits.map((split) => split.materialVariantId));
        if (requirement.splits.length === 0 || splitIds.size !== requirement.splits.length)
          throw new ProductionDomainError(
            'INVALID_INPUT',
            '每种追加物料至少选择一个且不能重复选择版本',
          );
        if (orderPolicy.orderType === 'mass_production' && requirement.splits.length !== 1)
          throw new ProductionDomainError(
            'INVALID_INPUT',
            '批量生产工单的同一基础物料只能追加一个版本',
          );
        for (const split of requirement.splits) {
          if (!Number.isSafeInteger(split.quantity) || split.quantity <= 0)
            throw new ProductionDomainError('INVALID_INPUT', '人工追加数量必须为正整数');
          const variant = variantsById.get(split.materialVariantId);
          if (!variant || variant.materialId !== String(basis.material_id))
            throw new ProductionDomainError(
              'INVALID_INPUT',
              '人工追加只能选择对应基础物料下的启用版本',
            );
          await requireWorkOrderMaterialVariant(
            db,
            orderPolicy,
            basis.material_id,
            variant.id,
            context.actorId!,
          );
          lines.push({
            identityId: `${basis.id}:${variant.id}`,
            requirementBasisId: basis.id,
            productMaterialId: basis.product_material_id,
            itemId: basis.material_id,
            materialVariantId: variant.id,
            materialVariantCode: variant.variantCode,
            itemCode: basis.material_code_snapshot,
            quantityPerUnit: basis.quantity_per_unit_snapshot,
            unit: basis.unit_snapshot,
            plannedOutputQuantity: basis.planned_output_quantity_snapshot,
            needNumber: `${split.quantity}.0000`,
            demandType: 'manual_additional',
          });
        }
      }
      const additionNo = `MD-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const [addition] = await db.execute<ResultSetHeader>(
        `INSERT INTO production_manual_demand_addition
         (addition_no,production_batch_id,reason,created_by) VALUES (?,?,?,?)`,
        [additionNo, command.productionBatchId, reason, context.actorId],
      );
      for (const line of lines) line.manualAdditionId = addition.insertId;
      const demandIds = await mysqlProductionDemandPlanWriter.createDemandGroup(db, {
        batchId: command.productionBatchId,
        actorId: context.actorId,
        source: {
          type: DEMAND_GENERATION_GROUP_TYPE.manualAdditional,
          productionBatchId: command.productionBatchId,
          businessActionNo: additionNo,
        },
        lines,
      });
      await this.audit(db, context, String(addition.insertId), {
        additionNo,
        productionBatchId: command.productionBatchId,
        demandIds,
        requirements: command.requirements,
        reason,
      });
      return {
        additionId: String(addition.insertId),
        additionNo,
        demandIds,
      };
    });
  }

  private async listBatches(query: MaterialDemandManagementQuery): Promise<BatchManagementRow[]> {
    // The management surface is an audit/history view as well as a work queue;
    // cancelled batches may still contain generated demand snapshots.
    const conditions = ['1=1'];
    const parameters: Array<string | number> = [];
    if (query.productionBatchId) {
      conditions.push('b.id=?');
      parameters.push(query.productionBatchId);
    }
    const [rows] = await this.pool.query<BatchManagementRow[]>(
      `SELECT b.id,b.batch_no,wo.work_order_no,wo.order_type,b.product_id,b.planned_quantity,b.status
       FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id
       WHERE ${conditions.join(' AND ')} ORDER BY b.id DESC`,
      parameters,
    );
    return rows;
  }

  private audit(
    db: PoolConnection,
    context: CommandContext,
    additionId: string,
    afterData: unknown,
  ): Promise<void> {
    return writeTransactionalAudit(db, {
      logType: 'business',
      module: 'production',
      action: 'production-material-demand.add-manual',
      userId: context.actorId,
      targetId: additionId,
      targetType: 'production_manual_demand_addition',
      result: 'success',
      beforeData: null,
      afterData,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}

const placeholders = (values: { length: number }) => Array(values.length).fill('?').join(',');
const groupBy = <T>(values: T[], key: (value: T) => string): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const group = key(value);
    grouped.set(group, [...(grouped.get(group) ?? []), value]);
  }
  return grouped;
};
