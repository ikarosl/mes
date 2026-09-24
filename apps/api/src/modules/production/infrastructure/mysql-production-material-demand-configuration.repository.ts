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
  ProductInventoryEligibility,
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
  requireTaskMaterialVariant,
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
  locked_material_variant_id: number;
  supplier_hint: string | null;
};

type DemandRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  requirement_basis_id: number | null;
  product_material_id: number | null;
  item_id: number;
  item_code_snapshot: string;
  item_name: string;
  unit_snapshot: string;
  material_variant_id: number;
  material_variant_code_snapshot: string;
  need_number: string;
  remaining_number: string;
  demand_type: DemandType;
  parent_demand_id: number | null;
  business_status: DemandBusinessStatus;
  supplier_hint: string | null;
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
    private readonly eligibility: ProductInventoryEligibility,
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
          quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number,locked_material_variant_id,supplier_hint
       FROM production_material_requirement_basis
       WHERE production_batch_id IN (${placeholders(batchIds)}) ORDER BY production_batch_id,id`,
      batchIds,
    );
    const [demandRows] = await this.pool.query<DemandRow[]>(
      `SELECT d.id,d.production_batch_id,d.requirement_basis_id,d.product_material_id,d.item_id,
          d.item_code_snapshot,${currentMaterialNameSql('d.item_id')} item_name,d.unit_snapshot,
          d.material_variant_id,d.material_variant_code_snapshot,d.need_number,d.remaining_number,
          d.demand_type,d.parent_demand_id,d.business_status,COALESCE(basis.supplier_hint,d.supplier_hint) supplier_hint
       FROM production_item_demand d
       LEFT JOIN production_material_requirement_basis basis ON basis.id=d.requirement_basis_id
       WHERE d.production_batch_id IN (${placeholders(batchIds)}) ORDER BY d.production_batch_id,d.id`,
      batchIds,
    );
    const basisByBatch = groupBy(basisRows, (row) => String(row.production_batch_id));
    const boms = new Map<string, ProductBomSnapshot>();
    for (const batch of batches) {
      if (batch.status !== 'pending' || batch.order_type === 'research') continue;
      const result = await this.products.getApprovedBomSnapshot(String(batch.product_id));
      if (result.status !== 'success')
        throw new ProductionDomainError('INVALID_INPUT', result.message);
      boms.set(String(batch.id), result.value);
    }
    const materialIds = [
      ...new Set([
        ...basisRows.map((basis) => String(basis.material_id)),
        ...demandRows.map((demand) => String(demand.item_id)),
        ...[...boms.values()].flatMap((bom) => bom.lines.map((line) => line.materialId)),
      ]),
    ];
    const allVariants = await this.materialVariants.listEnabledByMaterials(materialIds);
    const variantByMaterial = groupBy(allVariants, (variant) => variant.materialId);
    const demandByMaterial = groupBy(
      demandRows,
      (row) => `${row.production_batch_id}:${row.item_id}`,
    );
    const rows: MaterialDemandManagementRow[] = [];
    for (const batch of batches) {
      const existingBasis = basisByBatch.get(String(batch.id)) ?? [];
      const bases = new Map(existingBasis.map((basis) => [String(basis.material_id), basis]));
      const frozenLines = existingBasis.map((basis) => ({
        productMaterialId: String(basis.product_material_id),
        materialId: String(basis.material_id),
        itemCode: basis.material_code_snapshot,
        productName: basis.material_name,
        unit: basis.unit_snapshot,
        quantityPerUnit: String(basis.quantity_per_unit_snapshot),
      }));
      const researchLines = [
        ...new Map(
          demandRows
            .filter((demand) => String(demand.production_batch_id) === String(batch.id))
            .map((demand) => [
              String(demand.item_id),
              {
                productMaterialId: null,
                materialId: String(demand.item_id),
                itemCode: demand.item_code_snapshot,
                productName: demand.item_name,
                unit: demand.unit_snapshot,
                quantityPerUnit: null,
              },
            ]),
        ).values(),
      ];
      const lines =
        batch.order_type === 'research'
          ? researchLines
          : (boms.get(String(batch.id))?.lines ?? frozenLines);
      for (const line of lines) {
        const basis = bases.get(line.materialId);
        const demands = demandByMaterial.get(`${batch.id}:${line.materialId}`) ?? [];
        const initial = demands.filter((demand) => demand.demand_type === 'normal');
        const variants: MaterialDemandManagementVariant[] = (
          variantByMaterial.get(line.materialId) ?? []
        ).map((variant) => ({
          materialVariantId: variant.id,
          materialVariantCode: variant.variantCode,
          majorVersion: variant.majorVersion,
          minorVersion: variant.minorVersion,
          status: variant.status,
          selectedQuantity:
            initial
              .find((demand) => String(demand.material_variant_id) === variant.id)
              ?.need_number?.toString() ?? null,
        }));
        rows.push({
          id: basis ? String(basis.id) : `${batch.id}:${line.materialId}`,
          productionBatchId: String(batch.id),
          batchNo: batch.batch_no,
          workOrderNo: batch.work_order_no,
          orderType: batch.order_type,
          requirementBasisId: basis ? String(basis.id) : null,
          productMaterialId: line.productMaterialId,
          materialId: line.materialId,
          materialCode: line.itemCode,
          materialName: line.productName,
          unit: line.unit,
          requiredQuantity:
            line.quantityPerUnit === null
              ? null
              : String(
                  basis?.required_number ??
                    multiplyIntegerQuantities(line.quantityPerUnit, batch.planned_quantity),
                ),
          configuredQuantity: String(
            (batch.order_type === 'research' ? demands : initial).reduce(
              (total, demand) => total + integerQuantity(demand.need_number),
              0,
            ),
          ),
          lockedMaterialVariantId: basis ? String(basis.locked_material_variant_id) : null,
          supplierHint: basis?.supplier_hint ?? null,
          status: demands.length ? 'configured' : 'pending',
          demands: demands.map(mapManagementDemand),
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
      if (orderPolicy.orderType !== 'mass_production')
        throw new ProductionDomainError('INVALID_INPUT', '研发任务请通过手工提需录入物料');
      if (batch.status !== 'pending')
        throw new ProductionDomainError('INVALID_STATE', '只有待配置生产批次可以确认版本需求');

      // This is deliberately repeated inside the local transaction. The Product
      // public query reuses the active connection, so the BOM and exact-version
      // status used to write facts are the same snapshot as the locked batch.
      const bomResult = await this.products.getApprovedBomSnapshot(String(batch.product_id));
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
            unit_snapshot,quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number,created_by,locked_material_variant_id,supplier_hint)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
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
            requirement.splits[0]!.materialVariantId,
            requirement.splits[0]!.supplierHint?.trim() || null,
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
            plannedOutputQuantity: String(batch.planned_quantity),
            needNumber: String(split.quantity),
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
      if (
        ['cancelled', 'completed', 'terminated', 'closing'].includes(batch.status) ||
        (batch.status === 'pending' && orderPolicy.orderType !== 'research')
      )
        throw new ProductionDomainError('INVALID_STATE', '当前任务不能手工提需');
      const [basisRows] = await db.query<BasisRow[]>(
        `SELECT id,production_batch_id,product_material_id,material_id,material_code_snapshot,
          unit_snapshot,quantity_per_unit_snapshot,planned_output_quantity_snapshot,required_number,
          locked_material_variant_id,supplier_hint
         FROM production_material_requirement_basis WHERE production_batch_id=? FOR SHARE`,
        [command.productionBatchId],
      );
      const bases = new Map(basisRows.map((basis) => [String(basis.material_id), basis]));
      const materialIds = command.requirements.map((requirement) => requirement.materialId);
      if (!materialIds.length || new Set(materialIds).size !== materialIds.length)
        throw new ProductionDomainError(
          'INVALID_INPUT',
          '至少选择一种物料，同次提需的基础物料不能重复',
        );
      for (const requirement of command.requirements) {
        if (
          !requirement.splits.length ||
          new Set(requirement.splits.map((split) => split.materialVariantId)).size !==
            requirement.splits.length
        )
          throw new ProductionDomainError(
            'INVALID_INPUT',
            '每种物料至少选择一个且不能重复选择版本',
          );
        if (orderPolicy.orderType === 'mass_production' && requirement.splits.length !== 1)
          throw new ProductionDomainError('INVALID_INPUT', '批量任务同一种物料只能使用已锁定版本');
        for (const split of requirement.splits) {
          if (
            !Number.isSafeInteger(split.quantity) ||
            split.quantity <= 0 ||
            split.quantity > 99_999_999
          )
            throw new ProductionDomainError('INVALID_INPUT', '需求数量必须为范围内的正整数');
          if (orderPolicy.orderType === 'mass_production' && split.supplierHint?.trim())
            throw new ProductionDomainError(
              'INVALID_INPUT',
              '批量任务的供应商提示随初始需求冻结，追加时不能修改',
            );
        }
      }
      const references = await this.eligibility.requireProductionIssuableReferences({
        references: command.requirements.flatMap((requirement) =>
          requirement.splits.map((split) => ({
            itemId: requirement.materialId,
            materialVariantId: split.materialVariantId,
          })),
        ),
      });
      if (references.status !== 'success')
        throw new ProductionDomainError('INVALID_INPUT', references.message);
      const byVariant = new Map(
        references.value.map((reference) => [reference.materialVariantId, reference]),
      );
      const lines: DemandPlanLine[] = [];
      for (const requirement of command.requirements) {
        const basis = bases.get(requirement.materialId);
        if (orderPolicy.orderType === 'mass_production' && !basis)
          throw new ProductionDomainError('INVALID_INPUT', '追加物料不属于本任务冻结 BOM');
        for (const split of requirement.splits) {
          const reference = byVariant.get(split.materialVariantId);
          if (!reference || reference.itemId !== requirement.materialId)
            throw new ProductionDomainError('INVALID_INPUT', '物料与版本不匹配');
          await requireTaskMaterialVariant(
            db,
            orderPolicy,
            requirement.materialId,
            split.materialVariantId,
          );
          lines.push({
            identityId: `${requirement.materialId}:${split.materialVariantId}`,
            requirementBasisId: basis?.id ?? null,
            productMaterialId: basis?.product_material_id ?? null,
            itemId: reference.itemId,
            materialVariantId: reference.materialVariantId,
            materialVariantCode: reference.materialVariantCode,
            itemCode: reference.itemCode,
            quantityPerUnit: basis ? String(basis.quantity_per_unit_snapshot) : null,
            plannedOutputQuantity: basis ? String(basis.planned_output_quantity_snapshot) : null,
            unit: basis?.unit_snapshot ?? reference.unit,
            needNumber: String(split.quantity),
            supplierHint:
              orderPolicy.orderType === 'research' ? split.supplierHint?.trim() || null : null,
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
        expectedBatchVersion: batch.version,
        transitionToMaterialPending: batch.status === 'pending',
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

const mapManagementDemand = (demand: DemandRow): MaterialDemandManagementDemand => ({
  demandId: String(demand.id),
  materialVariantId: String(demand.material_variant_id),
  materialVariantCode: demand.material_variant_code_snapshot,
  demandQuantity: String(demand.need_number),
  remainingQuantity: String(demand.remaining_number),
  demandType: demand.demand_type,
  parentDemandId: demand.parent_demand_id === null ? null : String(demand.parent_demand_id),
  businessStatus: demand.business_status,
  supplierHint: demand.supplier_hint,
});
