import { Injectable } from '@nestjs/common';
import { isBatchNoValid } from '@company/code-rules';
import type {
  CreateProductionBatchPayload,
  CreateWorkOrderPayload,
  ProductionBatchDetail,
  ProductionBatchItem,
  ProductionBatchQuery,
  UpdateProductionBatchPayload,
  UpdateBatchStepExecutionPayload,
  UpdateWorkOrderPayload,
  WorkOrderDetail,
  WorkOrderQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import {
  ProductSnapshotQuery,
  type ProcessRouteSnapshot,
  type ProductQueryResult,
} from '../../product/public.js';
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
  listWorkOrderOptions() {
    return this.production.listWorkOrderOptions();
  }
  async getWorkOrder(id: string) {
    return this.enrichWorkOrder(await this.production.getWorkOrder(id));
  }
  async listBatches(query: ProductionBatchQuery) {
    const result = await this.production.listBatches(query);
    return { ...result, items: await this.enrichBatches(result.items) };
  }
  async getBatch(id: string) {
    return this.enrichBatchDetail(await this.production.getBatch(id));
  }
  async listWorkOrderBatches(id: string) {
    return this.enrichBatches(await this.production.listWorkOrderBatches(id));
  }

  async createWorkOrder(payload: CreateWorkOrderPayload, audit: CommandContext) {
    if (payload.workOrderOwnerId) await this.requireActiveUser(payload.workOrderOwnerId);
    this.assertPlanDates(payload.planStartDate, payload.planEndDate);
    const product = this.requireProduct(
      await this.products.getProductionProduct(payload.productId),
    );
    return this.enrichWorkOrder(
      await this.production.createWorkOrder(this.cleanWorkOrder(payload), product, audit),
    );
  }
  async updateWorkOrder(id: string, payload: UpdateWorkOrderPayload, audit: CommandContext) {
    if (payload.workOrderOwnerId !== undefined)
      await this.requireActiveUser(payload.workOrderOwnerId);
    this.assertPlanDates(payload.planStartDate, payload.planEndDate);
    const product =
      payload.productId === undefined
        ? undefined
        : this.requireProduct(await this.products.getProductionProduct(payload.productId!));
    return this.enrichWorkOrder(
      await this.production.updateWorkOrder(id, this.cleanVersioned(payload), product, audit),
    );
  }
  async releaseWorkOrder(id: string, version: number, audit: CommandContext) {
    const workOrder = await this.production.withWorkOrderReleaseTransaction(
      id,
      async (productId) => {
        const product = this.requireProduct(await this.products.getProductionProduct(productId));
        return this.production.releaseWorkOrder(id, version, product, audit);
      },
    );
    return this.enrichWorkOrder(workOrder);
  }
  async cancelWorkOrder(id: string, version: number, audit: CommandContext) {
    return this.enrichWorkOrder(
      await this.production.transitionWorkOrder(id, 'cancel', version, audit),
    );
  }
  async closeWorkOrder(id: string, version: number, audit: CommandContext) {
    return this.enrichWorkOrder(
      await this.production.transitionWorkOrder(id, 'close', version, audit),
    );
  }

  async createBatch(
    workOrderId: string,
    payload: CreateProductionBatchPayload,
    audit: CommandContext,
  ) {
    const normalizedPayload = this.cleanBatch(payload);
    this.assertPlanDates(normalizedPayload.planStartDate, normalizedPayload.planEndDate);
    if (
      normalizedPayload.batchNo &&
      !isBatchNoValid(normalizedPayload.batchNo, PRODUCTION_BATCH_NO_RULE)
    ) {
      throw new ProductionDomainError('INVALID_INPUT', '手动批次号必须符合 task_batch-001 格式');
    }
    await this.requireActiveUser(payload.ownerId ?? null);
    const batch = await this.production.withBatchCreationTransaction(
      workOrderId,
      async (workOrderProductId) => {
        const route = this.requireProduct(
          await this.products.getProductionRouteSnapshot(
            workOrderProductId,
            normalizedPayload.routeId ?? null,
          ),
        );
        const stepOverrides = await this.resolveStepOverrides(
          normalizedPayload.stepOverrides ?? [],
          route,
        );
        return this.production.createBatch(
          workOrderId,
          normalizedPayload,
          route,
          stepOverrides,
          audit,
        );
      },
    );
    return this.enrichBatchDetail(batch);
  }
  async updateBatch(id: string, payload: UpdateProductionBatchPayload, audit: CommandContext) {
    if (payload.ownerId !== undefined) await this.requireActiveUser(payload.ownerId);
    this.assertPlanDates(payload.planStartDate, payload.planEndDate);
    return this.enrichBatchDetail(
      await this.production.updateBatch(id, this.cleanBatchUpdate(payload), audit),
    );
  }
  async generateMaterialDemands(id: string, version: number, audit: CommandContext) {
    const productId = await this.production.getBatchProductId(id);
    const bom = this.requireProduct(await this.products.getBomSnapshot(productId));
    if (bom.lines.length === 0)
      throw new ProductionDomainError('INVALID_INPUT', '产品未配置启用的 BOM，无法生成物料需求');
    return this.enrichBatchDetail(
      await this.production.generateMaterialDemands(id, version, bom, audit),
    );
  }
  async updateBatchStepExecution(
    batchId: string,
    recordId: string,
    payload: UpdateBatchStepExecutionPayload,
    audit: CommandContext,
  ) {
    if (payload.responsibleUserId !== undefined)
      await this.requireActiveUser(payload.responsibleUserId);
    const actualSop =
      payload.actualSopFileId === undefined
        ? undefined
        : payload.actualSopFileId === null
          ? null
          : this.requireProduct(
              await this.products.getEnabledSopFileSnapshot(payload.actualSopFileId!),
            );
    return this.enrichBatchDetail(
      await this.production.updateBatchStepExecution(batchId, recordId, payload, actualSop, audit),
    );
  }
  private async requireActiveUser(id: string | null): Promise<void> {
    if (!id) return;
    const users = await this.identity.listActiveUserOptionsByIds([id]);
    if (users.length !== 1)
      throw new ProductionDomainError('INVALID_INPUT', '负责人不存在或已停用');
  }
  private requireProduct<T>(result: ProductQueryResult<T>): T {
    if (result.status === 'success') return result.value;
    throw new ProductionDomainError(
      result.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
      result.message,
    );
  }
  private async enrichWorkOrder(workOrder: WorkOrderDetail): Promise<WorkOrderDetail> {
    return { ...workOrder, batches: await this.enrichBatches(workOrder.batches ?? []) };
  }

  private async enrichBatches(batches: ProductionBatchItem[]): Promise<ProductionBatchItem[]> {
    const names = await this.resolveUserNames(batches.map((batch) => batch.ownerId));
    return batches.map((batch) => ({
      ...batch,
      ownerName: batch.ownerId ? (names.get(batch.ownerId) ?? null) : null,
    }));
  }

  private async enrichBatchDetail(batch: ProductionBatchDetail): Promise<ProductionBatchDetail> {
    const stepRecords = batch.stepRecords ?? [];
    const names = await this.resolveUserNames([
      batch.ownerId,
      ...stepRecords.flatMap((step) => [step.defaultResponsibleUserId, step.responsibleUserId]),
    ]);
    return {
      ...batch,
      ownerName: batch.ownerId ? (names.get(batch.ownerId) ?? null) : null,
      stepRecords: stepRecords.map((step) => ({
        ...step,
        defaultResponsibleUserName: step.defaultResponsibleUserId
          ? (names.get(step.defaultResponsibleUserId) ?? null)
          : null,
        responsibleUserName: step.responsibleUserId
          ? (names.get(step.responsibleUserId) ?? null)
          : null,
      })),
    };
  }

  private async resolveUserNames(
    ids: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (uniqueIds.length === 0) return new Map();
    const users = await this.identity.listUserReferencesByIds(uniqueIds);
    return new Map(users.map((user) => [user.id, user.displayName]));
  }
  private assertPlanDates(start: string | null | undefined, end: string | null | undefined): void {
    if (start && end && start > end)
      throw new ProductionDomainError('INVALID_INPUT', '计划完工日期不能早于计划开始日期');
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
    if (payload.remark === undefined) return payload;
    return { ...payload, remark: payload.remark?.trim() || null };
  }
  private async resolveStepOverrides(
    overrides: NonNullable<CreateProductionBatchPayload['stepOverrides']>,
    route: ProcessRouteSnapshot | null,
  ): Promise<ResolvedBatchStepOverride[]> {
    if (overrides.length === 0) return [];
    if (!route)
      throw new ProductionDomainError('INVALID_INPUT', '未选择工艺路线时不能覆盖工序执行参数');
    const routeStepIds = new Set(route.steps.map((step) => step.routeStepId));
    const seen = new Set<string>();
    for (const override of overrides) {
      if (!routeStepIds.has(override.routeStepId))
        throw new ProductionDomainError('INVALID_INPUT', '工序覆盖项不属于所选工艺路线');
      if (seen.has(override.routeStepId))
        throw new ProductionDomainError('INVALID_INPUT', '同一工序只能提交一次执行参数覆盖');
      seen.add(override.routeStepId);
      if (override.responsibleUserId) await this.requireActiveUser(override.responsibleUserId);
    }
    return Promise.all(
      overrides.map(async (override) => ({
        routeStepId: override.routeStepId,
        responsibleUserId: override.responsibleUserId ?? null,
        actualSop: override.actualSopFileId
          ? this.requireProduct(
              await this.products.getEnabledSopFileSnapshot(override.actualSopFileId!),
            )
          : null,
      })),
    );
  }
}

const PRODUCTION_BATCH_NO_RULE = { prefix: 'task_batch', padding: 3 } as const;
