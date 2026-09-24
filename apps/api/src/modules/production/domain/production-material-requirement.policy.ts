import { ProductionDomainError } from './production.errors.js';

export interface NormalDemandVariantSplit {
  materialVariantId: string;
  quantity: number;
}

/**
 * Checks one base-BOM requirement before its exact-version demand facts are written.
 * This is intentionally an aggregate invariant and therefore belongs in the same
 * application transaction that creates `production_material_requirement_basis` and
 * all `production_item_demand` rows; it cannot be represented by a row CHECK.
 *
 * The administrator confirmation use case calls this policy after re-reading and
 * locking the batch, Product BOM and enabled variant rows in its local transaction.
 */
export const requireCompleteNormalDemandSplit = (
  requiredQuantity: number,
  splits: NormalDemandVariantSplit[],
): void => {
  if (!Number.isSafeInteger(requiredQuantity) || requiredQuantity <= 0 || splits.length === 0)
    throw new ProductionDomainError('INVALID_INPUT', '物料版本分配必须覆盖完整的正整数需求');

  const variantIds = new Set<string>();
  let total = 0;
  for (const split of splits) {
    if (!Number.isSafeInteger(split.quantity) || split.quantity <= 0)
      throw new ProductionDomainError('INVALID_INPUT', '物料版本需求数量必须为正整数');
    if (variantIds.has(split.materialVariantId))
      throw new ProductionDomainError('INVALID_INPUT', '同一次配置中物料版本不能重复');
    variantIds.add(split.materialVariantId);
    total += split.quantity;
  }

  if (total !== requiredQuantity)
    throw new ProductionDomainError('INVALID_INPUT', '各版本需求数量之和必须等于基础物料需求量');
};

/** 确认损耗仍须引用原已领料分配的精确版本，不产生新的物料需求。 */
export const requireMaterialLossSourceVariant = (
  lostMaterialVariantId: string,
  allocationMaterialVariantId: string,
): void => {
  if (lostMaterialVariantId !== allocationMaterialVariantId)
    throw new ProductionDomainError('INVALID_INPUT', '损耗来源版本必须与原已领料分配一致');
};
