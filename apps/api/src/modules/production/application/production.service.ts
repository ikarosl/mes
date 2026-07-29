import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isBatchNoValid } from '@company/code-rules';
import type {
  CreateProductionBatchPayload,
  CreateWorkOrderPayload,
  ProductionBatchQuery,
  UpdateProductionBatchPayload,
  UpdateBatchStepExecutionPayload,
  UpdateWorkOrderPayload,
  WorkOrderQuery,
} from '@company/contracts';
import type { AuditContext } from '../../../common/audit/audit.types.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductSnapshotQuery } from '../../product/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionRepository } from './ports/production.repository.js';
import type { ResolvedBatchStepOverride } from './ports/production.repository.js';

@Injectable()
export class ProductionService {
  constructor(
    private readonly production: ProductionRepository,
    private readonly products: ProductSnapshotQuery,
    private readonly identity: IdentityDirectoryService,
  ) {}

  listWorkOrders(query: WorkOrderQuery) {
    return this.production.listWorkOrders(query);
  }
  getWorkOrder(id: string) {
    return this.map(() => this.production.getWorkOrder(id));
  }
  listBatches(query: ProductionBatchQuery) {
    return this.production.listBatches(query);
  }
  getBatch(id: string) {
    return this.map(() => this.production.getBatch(id));
  }
  listWorkOrderBatches(id: string) {
    return this.map(() => this.production.listWorkOrderBatches(id));
  }

  async createWorkOrder(payload: CreateWorkOrderPayload, audit: AuditContext) {
    if (payload.workOrderOwnerId) await this.requireActiveUser(payload.workOrderOwnerId);
    this.assertPlanDates(payload.planStartDate, payload.planEndDate);
    const product = await this.map(() => this.products.getProductionProduct(payload.productId));
    return this.map(() =>
      this.production.createWorkOrder(this.cleanWorkOrder(payload), product, audit),
    );
  }
  updateWorkOrder(id: string, payload: UpdateWorkOrderPayload, audit: AuditContext) {
    if (payload.workOrderOwnerId) return this.updateWorkOrderWithOwner(id, payload, audit);
    return this.map(() => this.production.updateWorkOrder(id, this.cleanVersioned(payload), audit));
  }
  releaseWorkOrder(id: string, version: number, audit: AuditContext) {
    return this.map(() => this.production.transitionWorkOrder(id, 'release', version, audit));
  }
  cancelWorkOrder(id: string, version: number, audit: AuditContext) {
    return this.map(() => this.production.transitionWorkOrder(id, 'cancel', version, audit));
  }
  closeWorkOrder(id: string, version: number, audit: AuditContext) {
    return this.map(() => this.production.transitionWorkOrder(id, 'close', version, audit));
  }

  async createBatch(
    workOrderId: string,
    payload: CreateProductionBatchPayload,
    audit: AuditContext,
  ) {
    const normalizedPayload = this.cleanBatch(payload);
    this.assertPlanDates(normalizedPayload.planStartDate, normalizedPayload.planEndDate);
    if (
      normalizedPayload.batchNo &&
      !isBatchNoValid(normalizedPayload.batchNo, PRODUCTION_BATCH_NO_RULE)
    ) {
      throw new BadRequestException('手动批次号必须符合 task_batch-001 格式');
    }
    await this.requireActiveUser(payload.ownerId ?? null);
    const routeId = payload.routeId ?? (await this.production.getDefaultRouteId(workOrderId));
    const route = routeId ? await this.map(() => this.products.getRouteSnapshot(routeId)) : null;
    const stepOverrides = await this.resolveStepOverrides(
      normalizedPayload.stepOverrides ?? [],
      route,
    );
    return this.map(() =>
      this.production.createBatch(workOrderId, normalizedPayload, route, stepOverrides, audit),
    );
  }
  async updateBatch(id: string, payload: UpdateProductionBatchPayload, audit: AuditContext) {
    if (payload.ownerId !== undefined) await this.requireActiveUser(payload.ownerId);
    this.assertPlanDates(payload.planStartDate, payload.planEndDate);
    return this.map(() => this.production.updateBatch(id, this.cleanBatchUpdate(payload), audit));
  }
  async generateMaterialDemands(id: string, version: number, audit: AuditContext) {
    const productId = await this.map(() => this.production.getBatchProductId(id));
    const bom = await this.map(() => this.products.getBomSnapshot(productId));
    if (bom.lines.length === 0)
      throw new BadRequestException('产品未配置启用的 BOM，无法生成物料需求');
    return this.map(() => this.production.generateMaterialDemands(id, version, bom, audit));
  }
  async updateBatchStepExecution(
    batchId: string,
    recordId: string,
    payload: UpdateBatchStepExecutionPayload,
    audit: AuditContext,
  ) {
    if (payload.responsibleUserId !== undefined)
      await this.requireActiveUser(payload.responsibleUserId);
    const actualSop =
      payload.actualSopFileId === undefined
        ? undefined
        : payload.actualSopFileId === null
          ? null
          : await this.map(() => this.products.getEnabledSopFileSnapshot(payload.actualSopFileId!));
    return this.map(() =>
      this.production.updateBatchStepExecution(batchId, recordId, payload, actualSop, audit),
    );
  }
  private async requireActiveUser(id: string | null): Promise<void> {
    if (!id) return;
    const users = await this.identity.listActiveUserOptionsByIds([id]);
    if (users.length !== 1) throw new BadRequestException('负责人不存在或已停用');
  }
  private async updateWorkOrderWithOwner(
    id: string,
    payload: UpdateWorkOrderPayload,
    audit: AuditContext,
  ) {
    await this.requireActiveUser(payload.workOrderOwnerId!);
    this.assertPlanDates(payload.planStartDate, payload.planEndDate);
    return this.map(() => this.production.updateWorkOrder(id, this.cleanVersioned(payload), audit));
  }
  private assertPlanDates(start: string | null | undefined, end: string | null | undefined): void {
    if (start && end && start > end)
      throw new BadRequestException('计划完工日期不能早于计划开始日期');
  }
  private cleanWorkOrder(payload: CreateWorkOrderPayload): CreateWorkOrderPayload {
    return {
      ...payload,
      workOrderNo: payload.workOrderNo.trim(),
      externalOrderNo: payload.externalOrderNo?.trim() || null,
      remark: payload.remark?.trim() || null,
    };
  }
  private cleanBatch(payload: CreateProductionBatchPayload): CreateProductionBatchPayload {
    return {
      ...payload,
      batchNo: payload.batchNo?.trim() || null,
      remark: payload.remark?.trim() || null,
    };
  }
  private cleanBatchUpdate(payload: UpdateProductionBatchPayload): UpdateProductionBatchPayload {
    return payload.remark === undefined
      ? payload
      : { ...payload, remark: payload.remark?.trim() || null };
  }
  private cleanVersioned<T extends { version: number; remark?: string | null }>(payload: T): T {
    return { ...payload, remark: payload.remark?.trim() || null };
  }
  private async map<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof ProductionDomainError) {
        if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
        if (error.code === 'CONFLICT' || error.code === 'CONCURRENT_MODIFICATION')
          throw new ConflictException(error.message);
        throw new BadRequestException(error.message);
      }
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new ConflictException('单据编号或幂等键已存在');
      throw error;
    }
  }
  private async resolveStepOverrides(
    overrides: NonNullable<CreateProductionBatchPayload['stepOverrides']>,
    route: Awaited<ReturnType<ProductSnapshotQuery['getRouteSnapshot']>> | null,
  ): Promise<ResolvedBatchStepOverride[]> {
    if (overrides.length === 0) return [];
    if (!route) throw new BadRequestException('未选择工艺路线时不能覆盖工序执行参数');
    const routeStepIds = new Set(route.steps.map((step) => step.routeStepId));
    const seen = new Set<string>();
    for (const override of overrides) {
      if (!routeStepIds.has(override.routeStepId))
        throw new BadRequestException('工序覆盖项不属于所选工艺路线');
      if (seen.has(override.routeStepId))
        throw new BadRequestException('同一工序只能提交一次执行参数覆盖');
      seen.add(override.routeStepId);
      if (override.responsibleUserId) await this.requireActiveUser(override.responsibleUserId);
    }
    return Promise.all(
      overrides.map(async (override) => ({
        routeStepId: override.routeStepId,
        responsibleUserId: override.responsibleUserId ?? null,
        actualSop: override.actualSopFileId
          ? await this.map(() => this.products.getEnabledSopFileSnapshot(override.actualSopFileId!))
          : null,
      })),
    );
  }
}

const PRODUCTION_BATCH_NO_RULE = { prefix: 'task_batch', padding: 3 } as const;
