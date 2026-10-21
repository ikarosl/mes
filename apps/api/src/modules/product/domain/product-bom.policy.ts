import type {
  ProductBomStatus,
  ProductItemKind,
  ReplaceProductMaterialsCommand,
} from '@company/contracts';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import {
  requireConfigurableProduct,
  type ConfigurableProduct,
} from './product-configuration.policy.js';
import { ProductDomainError } from './product.errors.js';

export interface ProductBomDefinition extends ConfigurableProduct {
  version: number;
  bomStatus: ProductBomStatus;
  isBomLocked: boolean;
  approvalInstanceId: string | null;
}

export interface BomMaterialEligibility {
  materialStatus: number;
  isMaterialDeleted: number;
  itemKind: ProductItemKind;
  categoryStatus: number;
  isCategoryDeleted: number;
  materialUnit: string;
  bomUnit: string;
}

/** 完整替换的请求规则在读取或写入 BOM 前执行。 */
export function requireValidBomReplacement(command: ReplaceProductMaterialsCommand): void {
  const { items, version } = command;
  if (!Number.isInteger(version) || version < 0 || version > 2_147_483_647) {
    throw new ProductDomainError('INVALID_INPUT', '请提供有效的产品版本');
  }
  if (items.length > 200) {
    throw new ProductDomainError('INVALID_INPUT', '一份 BOM 最多包含 200 行明细');
  }
  if (new Set(items.map((item) => item.materialId)).size !== items.length) {
    throw new ProductDomainError('INVALID_INPUT', '同一投入物料不能在一份 BOM 中重复');
  }
  if (
    items.some(
      (item) =>
        !Number.isInteger(item.quantityPerUnit) ||
        item.quantityPerUnit <= 0 ||
        item.quantityPerUnit > MAX_PERSISTED_INTEGER_QUANTITY ||
        !item.unit.trim(),
    )
  ) {
    throw new ProductDomainError(
      'INVALID_INPUT',
      'BOM 单位用量必须是 1 到 99999999 的整数，且用量单位不能为空',
    );
  }
}

/** 版本先于锁定与资格检查，避免旧页面覆盖当前聚合。 */
export function requireEditableBom(product: ProductBomDefinition, expectedVersion: number): void {
  if (product.version !== expectedVersion) {
    throw new ProductDomainError('CONFLICT', '产品资料已被其他操作修改，请重新加载 BOM 后重试');
  }
  if (product.isBomLocked) {
    throw new ProductDomainError(
      'CONFLICT',
      'BOM 已审批通过并永久锁定；原则变化请新建产品和产品编码',
    );
  }
  if (product.bomStatus === 'pending_approval') {
    throw new ProductDomainError('CONFLICT', 'BOM 审批中，不能修改 BOM');
  }
  requireConfigurableProduct(product);
}

/** 送审状态检查在分类读取前完成，保留原有冲突优先级。 */
export function requireBomSubmissionState(product: ProductBomDefinition): void {
  if (product.bomStatus === 'pending_approval') {
    throw new ProductDomainError('CONFLICT', '该产品已有进行中的 BOM 审批');
  }
  if (product.bomStatus === 'approved' || product.isBomLocked) {
    throw new ProductDomainError('CONFLICT', 'BOM 已批准并永久锁定，原则变化请新建产品编码');
  }
}

export function requireBomSubmissionProduct(
  product: ProductBomDefinition,
  expectedVersion: number,
): void {
  if (product.version !== expectedVersion) {
    throw new ProductDomainError('CONFLICT', '产品资料已被其他操作修改，请刷新后重试');
  }
  if (
    product.status !== 1 ||
    product.itemKind !== 'finished_product' ||
    product.acquireMethod !== 'self_made'
  ) {
    throw new ProductDomainError('INVALID_PRODUCT_KIND', '只有已启用的自制成品可以提交 BOM 审批');
  }
}

export function requireCurrentBomApproval(
  product: ProductBomDefinition,
  instanceId: string,
  expectedVersion: number,
): void {
  if (
    product.bomStatus !== 'pending_approval' ||
    String(product.approvalInstanceId) !== instanceId ||
    Number(product.version) !== expectedVersion
  ) {
    throw new ProductDomainError('CONFLICT', 'BOM 当前审批关联已变化，请刷新后重试');
  }
}

/** 送审和末级批准复用同一资格口径；取数与锁序由基础设施决定。 */
export function isEligibleBomMaterial(material: BomMaterialEligibility): boolean {
  return (
    material.materialStatus === 1 &&
    material.isMaterialDeleted === 0 &&
    material.itemKind === 'material' &&
    material.categoryStatus === 1 &&
    material.isCategoryDeleted === 0 &&
    material.bomUnit === material.materialUnit
  );
}

export function requireBomMaterialUnit(bomUnit: string, materialUnit: string): void {
  if (bomUnit !== materialUnit) {
    throw new ProductDomainError('INVALID_MATERIAL', 'BOM 用量单位必须等于投入物料的基础单位');
  }
}
