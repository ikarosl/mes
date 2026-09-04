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
import { mysqlProductionDemandPlanWriter } from './mysql-production-demand-plan.writer.js';
import { findBatch } from './mysql-production.shared.js';

type BatchManagementRow = RowDataPacket & {
  id: number;
  batch_no: string;
  work_order_no: string;
  product_id: number;
  planned_quantity: string;
  status: string;
};

type BasisRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  product_material_id: number;
  material_product_id: number;
  material_code_snapshot: string;
  material_name_snapshot: string;
  unit_snapshot: string;
  quantity_per_unit_snapshot: string;
  is_key_material_snapshot: number;
  need_batch_record_snapshot: number;
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

type VariantStockRow = RowDataPacket & {
  material_variant_id: number;
  quantity: string;
};

/**
 * Production owns demand facts but not Product's BOM/version master. The adapter
 * therefore consumes Product only through its public read boundary and writes the
 * immutable requirement basis plus exact demand facts in one local transaction.
 *
 * The management projection deliberately keeps stock advisory: no stock row is
 * selected or reserved while an administrator is editing a split.
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
      `SELECT id,production_batch_id,product_material_id,material_product_id,
          material_code_snapshot,material_name_snapshot,unit_snapshot,
          quantity_per_unit_snapshot,is_key_material_snapshot,need_batch_record_snapshot,
          planned_output_quantity_snapshot,required_number
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
      // drift merely because current Product master data was renamed/disabled.
      if (batch.status !== 'pending') continue;
      const result = await this.products.getBomSnapshot(String(batch.product_id));
      if (result.status === 'success') boms.set(String(batch.id), result.value);
    }
    const materialIds = [
      ...new Set([
        ...basisRows.map((basis) => String(basis.material_product_id)),
        ...[...boms.values()].flatMap((bom) => bom.lines.map((line) => line.materialProductId)),
      ]),
    ];
    // The management page is a selectable-candidate surface: only enabled
    // variants are returned. Historical disabled variants remain visible through
    // the demand snapshot itself, but can never be selected again.
    const allVariants = await this.materialVariants.listEnabledByMaterials(materialIds);
    const variantIds = [...new Set(allVariants.map((variant) => variant.id))];
    const stock = await this.listVariantStock(variantIds);
    const demandByBasis = groupBy(demandRows, (row) => String(row.requirement_basis_id));
    const variantByMaterial = groupBy(allVariants, (variant) => variant.materialProductId);
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
          materialProductId: String(basis.material_product_id),
          itemCode: basis.material_code_snapshot,
          productName: basis.material_name_snapshot,
          unit: basis.unit_snapshot,
          quantityPerUnit: basis.quantity_per_unit_snapshot,
          isKeyMaterial: Boolean(basis.is_key_material_snapshot),
          needBatchRecord: Boolean(basis.need_batch_record_snapshot),
        }));
      for (const line of [...currentLines, ...frozenOnlyLines]) {
        const basis = basisByProductMaterial.get(line.productMaterialId);
        const basisId = basis?.id ? String(basis.id) : `${batch.id}:${line.productMaterialId}`;
        const requiredQuantity =
          basis?.required_number ??
          multiplyIntegerQuantities(line.quantityPerUnit, batch.planned_quantity);
        const materialId = basis ? String(basis.material_product_id) : line.materialProductId;
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
          advisoryStockQuantity: stock.get(variant.id) ?? '0.0000',
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
          requirementBasisId: basis ? String(basis.id) : null,
          productMaterialId: line.productMaterialId,
          materialProductId: materialId,
          materialCode: basis?.material_code_snapshot ?? line.itemCode,
          materialName: basis?.material_name_snapshot ?? line.productName,
          unit: basis?.unit_snapshot ?? line.unit,
          requiredQuantity,
          configuredQuantity: `${configuredQuantity}.0000`,
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
        bom.lines.map((line) => line.materialProductId),
        { lock: true },
      );
      const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
      const requirementsByLine = new Map(
        requirements.map((requirement) => [requirement.productMaterialId, requirement]),
      );
      if (requirements.length === 0 || requirements.length !== requirementsByLine.size)
        throw new ProductionDomainError('INVALID_INPUT', '至少需要确认一条基础 BOM 明细的版本需求');
      for (const requirement of requirements) {
        const line = bom.lines.find(
          (candidate) => candidate.productMaterialId === requirement.productMaterialId,
        );
        if (!line) throw new ProductionDomainError('INVALID_INPUT', '基础 BOM 明细不存在或已变化');
        const required = integerQuantity(
          multiplyIntegerQuantities(line.quantityPerUnit, batch.planned_quantity),
        );
        requireCompleteNormalDemandSplit(required, requirement.splits);
        for (const split of requirement.splits) {
          const variant = variantsById.get(split.materialVariantId);
          if (!variant || variant.materialProductId !== line.materialProductId)
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
      for (const requirement of requirements) {
        if (existingBasis.has(requirement.productMaterialId))
          throw new ProductionDomainError('CONFLICT', '该基础物料的版本需求已经确认，不能重复配置');
      }
      const demandLines = [] as Array<{
        identityId: string;
        requirementBasisId: string;
        productMaterialId: string;
        itemId: string;
        materialVariantId: string;
        materialVariantCode: string;
        itemCode: string;
        itemName: string;
        quantityPerUnit: string;
        unit: string;
        isKeyMaterial: boolean;
        needBatchRecord: boolean;
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
           (production_batch_id,product_material_id,material_product_id,material_code_snapshot,
            material_name_snapshot,unit_snapshot,quantity_per_unit_snapshot,is_key_material_snapshot,
            need_batch_record_snapshot,planned_output_quantity_snapshot,required_number,created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            productionBatchId,
            line.productMaterialId,
            line.materialProductId,
            line.itemCode,
            line.productName,
            line.unit,
            line.quantityPerUnit,
            Number(line.isKeyMaterial),
            Number(line.needBatchRecord),
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
            itemId: line.materialProductId,
            materialVariantId: variant.id,
            materialVariantCode: variant.variantCode,
            itemCode: line.itemCode,
            itemName: line.productName,
            quantityPerUnit: line.quantityPerUnit,
            unit: line.unit,
            isKeyMaterial: line.isKeyMaterial,
            needBatchRecord: line.needBatchRecord,
            plannedOutputQuantity: batch.planned_quantity,
            needNumber: `${split.quantity}.0000`,
            demandType: 'normal',
          });
        }
      }
      const [[remaining]] = await db.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM production_material_requirement_basis WHERE production_batch_id=?',
        [productionBatchId],
      );
      const transitionToMaterialPending = Number(remaining?.count ?? 0) === bom.lines.length;
      await mysqlProductionDemandPlanWriter.createDemandGroup(db, {
        batchId: productionBatchId,
        actorId: context.actorId,
        source: { type: DEMAND_GENERATION_GROUP_TYPE.normal, productionBatchId },
        expectedBatchVersion: batch.version,
        transitionToMaterialPending,
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
          status: transitionToMaterialPending ? 'material_pending' : 'pending',
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
  ): Promise<{ demandId: string }> {
    if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
    return withTransaction(this.pool, async (db) => {
      // Re-read and lock every decision input in the Production transaction. In
      // particular, the selected variant is not trusted from an earlier
      // transaction because Product administrators may disable it concurrently.
      const [[parent]] = await db.query<
        (RowDataPacket & {
          id: number;
          production_batch_id: number;
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
          business_status: string;
        })[]
      >(
        `SELECT id,production_batch_id,requirement_basis_id,product_material_id,item_id,
            material_variant_id,item_code_snapshot,item_name_snapshot,material_variant_code_snapshot,
            quantity_per_unit_snapshot,unit_snapshot,is_key_material_snapshot,
            need_batch_record_snapshot,planned_output_quantity_snapshot,business_status
         FROM production_item_demand WHERE id=? FOR UPDATE`,
        [command.parentDemandId],
      );
      if (!parent) throw new ProductionDomainError('NOT_FOUND', '父物料需求不存在');
      if (!['active', 'fulfilled'].includes(parent.business_status))
        throw new ProductionDomainError('INVALID_STATE', '只有有效或已完成的需求可以人工补充');
      const batch = await findBatch(db, String(parent.production_batch_id), true);
      if (['cancelled', 'completed'].includes(batch.status))
        throw new ProductionDomainError('INVALID_STATE', '已取消或已完成批次不能人工补充物料需求');
      const bomResult = await this.products.getBomSnapshot(String(batch.product_id));
      if (bomResult.status !== 'success')
        throw new ProductionDomainError(
          bomResult.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
          bomResult.message,
        );
      const line = bomResult.value.lines.find(
        (candidate) => candidate.productMaterialId === String(parent.product_material_id),
      );
      if (!line || line.materialProductId !== String(parent.item_id))
        throw new ProductionDomainError('INVALID_INPUT', '父需求对应的 BOM 明细不存在或已变化');
      const [[basis]] = await db.query<
        (RowDataPacket & {
          id: number;
          production_batch_id: number;
          product_material_id: number;
          material_product_id: number;
        })[]
      >(
        `SELECT id,production_batch_id,product_material_id,material_product_id
         FROM production_material_requirement_basis
         WHERE id=? AND production_batch_id=? AND product_material_id=? AND material_product_id=?
         FOR UPDATE`,
        [
          parent.requirement_basis_id,
          parent.production_batch_id,
          parent.product_material_id,
          parent.item_id,
        ],
      );
      if (!basis)
        throw new ProductionDomainError('INVALID_INPUT', '父需求对应的版本需求基础不存在或已变化');
      const variants = await this.materialVariants.listEnabledByMaterials(
        [String(parent.item_id)],
        { lock: true },
      );
      const variant = variants.find((candidate) => candidate.id === command.materialVariantId);
      if (!variant)
        throw new ProductionDomainError('INVALID_INPUT', '人工补充只能选择该基础物料下的启用版本');
      if (!Number.isSafeInteger(command.quantity) || command.quantity <= 0)
        throw new ProductionDomainError('INVALID_INPUT', '人工补充数量必须为正整数');
      const reason = command.reason.trim();
      if (!reason) throw new ProductionDomainError('INVALID_INPUT', '人工补充原因不能为空');
      if (variant.materialProductId !== String(parent.item_id))
        throw new ProductionDomainError('INVALID_INPUT', '人工补充版本与父需求基础物料不一致');
      const additionNo = `MD-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const [addition] = await db.execute<ResultSetHeader>(
        `INSERT INTO production_manual_demand_addition
         (addition_no,production_batch_id,requirement_basis_id,parent_demand_id,reason,created_by)
         VALUES (?,?,?,?,?,?)`,
        [
          additionNo,
          parent.production_batch_id,
          parent.requirement_basis_id,
          parent.id,
          reason,
          context.actorId,
        ],
      );
      const [demandId] = await mysqlProductionDemandPlanWriter.createDemandGroup(db, {
        batchId: parent.production_batch_id,
        actorId: context.actorId,
        source: {
          type: DEMAND_GENERATION_GROUP_TYPE.manualAdditional,
          productionBatchId: parent.production_batch_id,
          businessActionNo: additionNo,
        },
        lines: [
          {
            identityId: addition.insertId,
            requirementBasisId: parent.requirement_basis_id,
            productMaterialId: parent.product_material_id,
            itemId: parent.item_id,
            materialVariantId: variant.id,
            materialVariantCode: variant.variantCode,
            itemCode: parent.item_code_snapshot,
            itemName: parent.item_name_snapshot,
            quantityPerUnit: parent.quantity_per_unit_snapshot,
            unit: parent.unit_snapshot,
            isKeyMaterial: parent.is_key_material_snapshot,
            needBatchRecord: parent.need_batch_record_snapshot,
            plannedOutputQuantity: parent.planned_output_quantity_snapshot,
            needNumber: `${command.quantity}.0000`,
            demandType: 'manual_additional',
            parentDemandId: parent.id,
            manualAdditionId: addition.insertId,
          },
        ],
      });
      await this.audit(db, context, String(demandId), {
        parentDemandId: String(parent.id),
        requirementBasisId: String(parent.requirement_basis_id),
        materialVariantId: variant.id,
        quantity: command.quantity,
        reason,
      });
      return { demandId: String(demandId) };
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
      `SELECT b.id,b.batch_no,wo.work_order_no,b.product_id,b.planned_quantity,b.status
       FROM production_batches b JOIN work_orders wo ON wo.id=b.work_order_id
       WHERE ${conditions.join(' AND ')} ORDER BY b.id DESC`,
      parameters,
    );
    return rows;
  }

  private async listVariantStock(variantIds: string[]): Promise<Map<string, string>> {
    if (variantIds.length === 0) return new Map();
    const [rows] = await this.pool.query<VariantStockRow[]>(
      `SELECT material_variant_id,COALESCE(SUM(current_quantity),0) quantity
       FROM inventory_material_variant_balance
       WHERE material_variant_id IN (${placeholders(variantIds)})
         AND stock_status='available' AND batch_status='available'
       GROUP BY material_variant_id`,
      variantIds,
    );
    return new Map(
      rows.map((row) => [String(row.material_variant_id), `${integerQuantity(row.quantity)}.0000`]),
    );
  }

  private audit(
    db: PoolConnection,
    context: CommandContext,
    demandId: string,
    afterData: unknown,
  ): Promise<void> {
    return writeTransactionalAudit(db, {
      logType: 'business',
      module: 'production',
      action: 'production-material-demand.add-manual',
      userId: context.actorId,
      targetId: demandId,
      targetType: 'production_item_demand',
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
