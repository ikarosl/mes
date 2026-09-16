import { Injectable, OnModuleInit } from '@nestjs/common';
import { PRODUCT_BOM_APPROVAL_SCENE } from '../approval-scenes.js';
import { ProductDomainError } from '../domain/product.errors.js';
import type {
  ApprovalSubjectType,
  ApprovalInstanceDetail,
  BomApprovalSnapshot,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import {
  ApprovalSubjectHandlerRegistry,
  ApprovalSubjectError,
  type ApprovalSubjectHandler,
  type ApprovalSubjectPreparation,
} from '../../approval/public.js';
import { ProductCatalogRepository } from './ports/product-catalog.repository.js';

/** BOM 场景的业务适配器：只把 Product 自己拥有的写操作注册给 Approval。 */
@Injectable()
export class ProductBomApprovalHandler implements ApprovalSubjectHandler, OnModuleInit {
  readonly scene = PRODUCT_BOM_APPROVAL_SCENE;
  readonly sceneCode = this.scene.code;
  readonly subjectType: ApprovalSubjectType = 'product';

  constructor(
    private readonly products: ProductCatalogRepository,
    private readonly registry: ApprovalSubjectHandlerRegistry,
  ) {}

  /** Nest 初始化此 provider 时登记当前实例；仅写入 Registry 的内存 Map，不落库。 */
  onModuleInit(): void {
    this.registry.register(this);
  }

  /** 送审准备：由 Product 锁成品根、核对版本和 BOM 资格，再返回受审快照。 */
  async prepareForApproval(
    subjectId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<ApprovalSubjectPreparation> {
    const preparation = await this.call(() =>
      this.products.prepareBomApproval(subjectId, expectedVersion, audit),
    );
    return { ...preparation, snapshotSchemaVersion: 2, businessAssigneeResolutions: [] };
  }

  /** Approval 创建申请后调用：绑定申请并冻结编辑，返回递增后的产品版本。 */
  bindApproval(
    subjectId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<number> {
    return this.call(() =>
      this.products.bindBomApproval(subjectId, instanceId, expectedVersion, audit),
    );
  }

  /** 只有末级通过才调用：重新校验 BOM 资格，由 Product 写入永久锁定事实。 */
  finalizeApproval(
    subjectId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void> {
    return this.call(() =>
      this.products.finalizeBomApproval(subjectId, instanceId, expectedVersion, audit),
    );
  }

  /** 驳回或撤回时恢复草稿并清空当前申请引用；历史申请与操作记录由 Approval 保留。 */
  restoreAfterApprovalEnd(
    subjectId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void> {
    return this.call(() =>
      this.products.restoreBomAfterApprovalEnd(subjectId, instanceId, expectedVersion, audit),
    );
  }

  /** 审批决定前锁成品根并核对当前申请与冻结版本；数据库行锁不等于 BOM 永久锁定。 */
  lockCurrentApproval(
    subjectId: string,
    instanceId: string,
    expectedVersion: number,
  ): Promise<void> {
    return this.call(() =>
      this.products.lockCurrentBomApproval(subjectId, instanceId, expectedVersion),
    );
  }

  /** 把 Product 内部错误转换为公开错误契约并继续抛出，交由外层审批事务回滚。 */
  private async call<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ProductDomainError) {
        throw new ApprovalSubjectError(
          error.code === 'NOT_FOUND'
            ? 'NOT_FOUND'
            : error.code === 'CONFLICT'
              ? 'CONFLICT'
              : 'INVALID_INPUT',
          error.message,
        );
      }
      throw error;
    }
  }

  /** BOM 证据由 Product 解释；名称按稳定 ID 读取当前值，不回写快照。 */
  async readSnapshotForDisplay(
    snapshot: unknown,
    schemaVersion: number,
  ): Promise<Pick<ApprovalInstanceDetail, 'subjectSnapshot' | 'materialNames'>> {
    if ((schemaVersion !== 1 && schemaVersion !== 2) || !this.isBomSnapshot(snapshot)) {
      throw new ApprovalSubjectError('CONFLICT', 'BOM 审批证据结构无法读取');
    }
    return {
      // 历史证据不回写；只投影当前公开字段，旧证据的额外属性不泄漏到接口。
      subjectSnapshot: {
        productId: snapshot.productId,
        itemCode: snapshot.itemCode,
        productName: snapshot.productName,
        unit: snapshot.unit,
        specValues: snapshot.specValues,
        materials: snapshot.materials.map(
          ({ id, materialId, itemCode, quantityPerUnit, unit, remark }) => ({
            id,
            materialId,
            itemCode,
            quantityPerUnit,
            unit,
            remark,
          }),
        ),
      },
      materialNames: await this.products.listMaterialNames(
        snapshot.materials.map((m) => m.materialId),
      ),
    };
  }

  /** 持久化 JSON 属于运行时输入，先校验结构再交给详情页使用。 */
  private isBomSnapshot(value: unknown): value is BomApprovalSnapshot {
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    return (
      ['productId', 'itemCode', 'productName', 'unit'].every(
        (key) => typeof row[key] === 'string',
      ) &&
      Array.isArray(row.specValues) &&
      row.specValues.every((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const spec = item as Record<string, unknown>;
        return (
          typeof spec.key === 'string' &&
          typeof spec.value === 'string' &&
          (spec.unit === undefined || typeof spec.unit === 'string')
        );
      }) &&
      Array.isArray(row.materials) &&
      row.materials.every((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const material = item as Record<string, unknown>;
        return (
          ['id', 'materialId', 'itemCode', 'quantityPerUnit', 'unit'].every(
            (key) => typeof material[key] === 'string',
          ) &&
          (material.remark === null || typeof material.remark === 'string')
        );
      })
    );
  }
}
