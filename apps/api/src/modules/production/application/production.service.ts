import { Injectable } from '@nestjs/common';
import type {
  CreateProductionBatchPayload,
  CreateWorkOrderPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionBatchCancellationCheck,
  ProductionBatchItem,
  ProductionBatchQuery,
  ProductionBatchStartRecord,
  ReleaseProductionBatchPayload,
  UpdateProductionBatchPayload,
  UpdateWorkOrderPayload,
  UserOption,
  WorkOrderDetail,
  WorkOrderItem,
  WorkOrderQuery,
} from '@company/contracts';
import { normalizeCreateBatchPayload } from '@company/utils';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import {
  ProductSnapshotQuery,
  ProductProductionDefinitionCommand,
  type ProcessRouteSnapshot,
  type ProcessRouteDisplayReference,
  type ProductQueryResult,
} from '../../product/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionRepository } from './ports/production.repository.js';
import { ProductionWorkOrderOwnerService } from './production-work-order-owner.service.js';
import { ProductionTaskOwnerService } from './production-task-owner.service.js';
import type { ResolvedBatchStepOverride } from './ports/production.repository.js';
import {
  CREATE_BATCH_IDEMPOTENCY_SCOPE,
  CREATE_WORK_ORDER_IDEMPOTENCY_SCOPE,
  RELEASE_BATCH_IDEMPOTENCY_SCOPE,
} from './idempotency/production-idempotency-scopes.contract.js';
import {
  productionBatchReleaseResultCodec,
  productionBatchResultCodec,
} from './idempotency/production-batch-result.codec.js';
import { workOrderCreateResultCodec } from './idempotency/work-order-create-result.codec.js';

@Injectable()
export class ProductionService {
  constructor(
    private readonly production: ProductionRepository,
    private readonly products: ProductSnapshotQuery,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
    private readonly workOrderOwners: ProductionWorkOrderOwnerService,
    private readonly taskOwners: ProductionTaskOwnerService,
    private readonly productDefinitions?: ProductProductionDefinitionCommand,
  ) {}

  async listWorkOrders(query: WorkOrderQuery): Promise<PageResult<WorkOrderItem>> {
    const result = await this.production.listWorkOrders(query);
    const names = await this.resolveUserNames(result.items.map((order) => order.workOrderOwnerId));
    return {
      ...result,
      items: result.items.map((order) => ({
        ...order,
        ownerName: order.workOrderOwnerId ? (names.get(order.workOrderOwnerId) ?? null) : null,
      })),
    };
  }
  listWorkOrderOptions() {
    return this.production.listWorkOrderOptions();
  }
  listWorkOrderOwnerOptions(): Promise<UserOption[]> {
    return this.workOrderOwners.listOptions();
  }
  listTaskOwnerOptions(): Promise<UserOption[]> {
    return this.taskOwners.listOptions();
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
  async getBatchStartRecord(id: string): Promise<ProductionBatchStartRecord | null> {
    const record = await this.production.getBatchStartRecord(id);
    if (record === null) return null;
    const names = await this.resolveUserNames([record.startedById]);
    return { ...record, startedByName: names.get(record.startedById) ?? null };
  }
  getBatchCancellationCheck(id: string): Promise<ProductionBatchCancellationCheck> {
    return this.production.getBatchCancellationCheck(id);
  }
  async createWorkOrder(payload: CreateWorkOrderPayload, audit: IdempotentCommandContext) {
    const body = this.cleanWorkOrder(payload);
    if (!body.planStartDate || !body.planEndDate)
      throw new ProductionDomainError('INVALID_INPUT', '工单计划开始日期和计划完成日期均为必填项');
    this.assertPlanDates(body.planStartDate, body.planEndDate);
    const commandContext: CommandContext = {
      actorId: audit.actorId,
      requestId: audit.requestId,
      ip: audit.ip,
      userAgent: audit.userAgent,
    };
    const execution = await this.idempotency.execute<WorkOrderDetail>({
      scope: CREATE_WORK_ORDER_IDEMPOTENCY_SCOPE,
      key: audit.idempotencyKey,
      actorId: audit.actorId,
      requestId: audit.requestId,
      request: { body },
      resultCodec: workOrderCreateResultCodec,
      handler: async () => {
        await this.workOrderOwners.requireEligible(body.workOrderOwnerId);
        const product = this.requireProduct(
          await this.products.getProductionProduct(body.productId),
        );
        return this.enrichWorkOrder(
          await this.production.createWorkOrder(body, product, commandContext),
        );
      },
    });
    return execution.result;
  }
  async updateWorkOrder(id: string, payload: UpdateWorkOrderPayload, audit: CommandContext) {
    this.assertPlanDates(payload.planStartDate, payload.planEndDate);
    const workOrder = await this.production.withWorkOrderUpdateTransaction(
      id,
      async ({ workOrderOwnerId }) => {
        const ownerId =
          payload.workOrderOwnerId === undefined ? workOrderOwnerId : payload.workOrderOwnerId;
        await this.workOrderOwners.requireEligible(ownerId);
        const product =
          payload.productId === undefined
            ? undefined
            : this.requireProduct(await this.products.getProductionProduct(payload.productId));
        return this.production.updateWorkOrder(id, this.cleanVersioned(payload), product, audit);
      },
    );
    return this.enrichWorkOrder(workOrder);
  }
  async releaseWorkOrder(id: string, version: number, audit: CommandContext) {
    const workOrder = await this.production.withWorkOrderReleaseTransaction(
      id,
      async ({ productId, workOrderOwnerId }) => {
        // 读取锁定工单的负责人，重新核验当前场景配置及角色成员资格。
        await this.workOrderOwners.requireEligible(workOrderOwnerId);
        const product = this.requireProduct(await this.products.getProductionProduct(productId));
        return this.production.releaseWorkOrder(id, version, product, audit);
      },
    );
    return this.enrichWorkOrder(workOrder);
  }
  async cancelWorkOrder(id: string, version: number, reason: string, audit: CommandContext) {
    const normalizedReason = reason.trim();
    if (!normalizedReason)
      throw new ProductionDomainError('INVALID_INPUT', '取消生产工单必须填写原因');
    return this.enrichWorkOrder(
      await this.production.cancelWorkOrder(id, version, normalizedReason, audit),
    );
  }
  async completeWorkOrder(id: string, version: number, audit: CommandContext) {
    return this.enrichWorkOrder(await this.production.completeWorkOrder(id, version, audit));
  }
  async closeWorkOrder(id: string, version: number, reason: string | null, audit: CommandContext) {
    return this.enrichWorkOrder(
      await this.production.closeWorkOrder(id, version, reason?.trim() || null, audit),
    );
  }

  async createBatch(
    workOrderId: string,
    payload: CreateProductionBatchPayload,
    audit: IdempotentCommandContext,
  ) {
    const normalizedPayload = normalizeCreateBatchPayload(payload);
    const fingerprintBody = {
      routeId: normalizedPayload.routeId,
      plannedQuantity: normalizedPayload.plannedQuantity,
      ownerId: normalizedPayload.ownerId,
      planStartDate: normalizedPayload.planStartDate,
      planEndDate: normalizedPayload.planEndDate,
      remark: normalizedPayload.remark,
      stepOverrides: Array.isArray(normalizedPayload.stepOverrides)
        ? normalizedPayload.stepOverrides.map((override) => ({
            routeStepId: override.routeStepId,
            actualSopFileId: override.actualSopFileId,
          }))
        : normalizedPayload.stepOverrides,
    } satisfies CreateProductionBatchPayload;
    // 纯格式校验在 executor 外；当前人员资格在首次执行的事务内复核，成功重放直接返回原结果。
    this.assertPlanDates(normalizedPayload.planStartDate, normalizedPayload.planEndDate);
    // 幂等能力止于 application service：repository 只接收不含幂等键的命令审计元数据。
    const commandContext: CommandContext = {
      actorId: audit.actorId,
      requestId: audit.requestId,
      ip: audit.ip,
      userAgent: audit.userAgent,
    };
    const execution = await this.idempotency.execute<ProductionBatchDetail>({
      scope: CREATE_BATCH_IDEMPOTENCY_SCOPE,
      key: audit.idempotencyKey,
      actorId: audit.actorId,
      requestId: audit.requestId,
      request: {
        params: { workOrderId },
        body: fingerprintBody,
      },
      resultCodec: productionBatchResultCodec,
      handler: async () => {
        // 旧成功键先重放原快照；新创建草稿不丢弃尚无保存位置的工序覆盖参数。
        if (normalizedPayload.stepOverrides?.length)
          throw new ProductionDomainError('INVALID_INPUT', '工序执行参数请在任务下达时提交');
        const productDefinitions = this.productDefinitions;
        if (!productDefinitions) {
          throw new Error('产品生产定义命令未配置');
        }
        return this.production.withBatchCreationTransaction(
          workOrderId,
          async (workOrderProductId, orderType) => {
            await this.taskOwners.requireEligible(normalizedPayload.ownerId);
            this.requireProduct(await this.products.getProductionProduct(workOrderProductId));
            const research = orderType === 'research';
            if (research) {
              if (normalizedPayload.routeId)
                throw new ProductionDomainError('INVALID_INPUT', '研发任务不配置工艺路线或工序');
            } else if (!normalizedPayload.routeId) {
              throw new ProductionDomainError('INVALID_INPUT', '请先选择工艺路线后再创建批量任务');
            }
            if (!research && normalizedPayload.routeId)
              this.requireProduct(
                await productDefinitions.requireRouteForProductionDraft(normalizedPayload.routeId),
              );
            const batch = await this.production.createBatch(
              workOrderId,
              normalizedPayload,
              commandContext,
            );
            // 首次执行即富化并保存最终响应快照，重放直接返回该快照；
            // 用户名变化不会改变重放响应，保证"相同 K1 + 相同内容 -> 原成功业务结果"。
            return this.enrichBatchDetail(batch);
          },
        );
      },
    });
    return execution.result;
  }
  async updateBatch(id: string, payload: UpdateProductionBatchPayload, audit: CommandContext) {
    this.assertPlanDates(payload.planStartDate, payload.planEndDate);
    const batch = await this.production.withBatchUpdateTransaction(id, async (current) => {
      if (current.version !== payload.version)
        throw new ProductionDomainError(
          'CONCURRENT_MODIFICATION',
          '生产任务已被其他操作修改，请刷新后重试',
        );
      await this.taskOwners.requireEligible(
        payload.ownerId === undefined ? current.ownerId : payload.ownerId,
      );
      const routeChanged = payload.routeId !== undefined && payload.routeId !== current.routeId;
      if (
        current.orderType === 'research' &&
        payload.routeId !== undefined &&
        payload.routeId !== null
      )
        throw new ProductionDomainError('INVALID_INPUT', '研发任务不配置工艺路线或工序');
      if (routeChanged && !current.isUnusedDraft)
        throw new ProductionDomainError('INVALID_STATE', '只有尚未下达的任务草稿可修改工艺路线');
      if (routeChanged) {
        if (!payload.routeId)
          throw new ProductionDomainError('INVALID_INPUT', '批量任务必须选择工艺路线');
        if (!this.productDefinitions) throw new Error('产品生产定义命令未配置');
        this.requireProduct(
          await this.productDefinitions.requireRouteForProductionDraft(payload.routeId),
        );
      }
      return this.production.updateBatch(id, this.cleanBatchUpdate(payload), audit);
    });
    return this.enrichBatchDetail(batch);
  }

  async releaseBatch(
    id: string,
    payload: ReleaseProductionBatchPayload,
    audit: IdempotentCommandContext,
  ) {
    const body: ReleaseProductionBatchPayload = {
      version: payload.version,
      stepOverrides: (payload.stepOverrides ?? []).map((override) => ({
        routeStepId: override.routeStepId,
        actualSopFileId: override.actualSopFileId ?? null,
      })),
    };
    const commandContext: CommandContext = {
      actorId: audit.actorId,
      requestId: audit.requestId,
      ip: audit.ip,
      userAgent: audit.userAgent,
    };
    const execution = await this.idempotency.execute<ProductionBatchDetail>({
      scope: RELEASE_BATCH_IDEMPOTENCY_SCOPE,
      key: audit.idempotencyKey,
      actorId: audit.actorId,
      requestId: audit.requestId,
      request: { params: { id }, body },
      resultCodec: productionBatchReleaseResultCodec,
      handler: () =>
        this.production.withBatchUpdateTransaction(id, async (current) => {
          if (current.version !== body.version)
            throw new ProductionDomainError(
              'CONCURRENT_MODIFICATION',
              '生产任务已被其他操作修改，请刷新后重试',
            );
          if (!current.isUnusedDraft)
            throw new ProductionDomainError('INVALID_STATE', '只有尚未使用的任务草稿可以下达');
          await this.taskOwners.requireEligible(current.ownerId);
          const research = current.orderType === 'research';
          let route: ProcessRouteSnapshot | null = null;
          if (research) {
            if (current.routeId || body.stepOverrides?.length)
              throw new ProductionDomainError('INVALID_INPUT', '研发任务不配置工艺路线或工序');
            this.requireProduct(await this.products.getProductionProduct(current.productId));
          } else {
            if (!this.productDefinitions) throw new Error('产品生产定义命令未配置');
            route = this.requireProduct(
              await this.productDefinitions.requireApprovedBomForProductionTask(
                current.productId,
                current.routeId,
              ),
            );
          }
          const stepOverrides = await this.resolveStepOverrides(body.stepOverrides ?? [], route);
          return this.enrichBatchDetail(
            await this.production.releaseBatch(
              id,
              body.version,
              route,
              stepOverrides,
              commandContext,
            ),
          );
        }),
    });
    return execution.result;
  }
  async cancelBatch(id: string, version: number, reason: string, audit: CommandContext) {
    const normalizedReason = reason.trim();
    if (!normalizedReason)
      throw new ProductionDomainError('INVALID_INPUT', '取消生产任务必须填写原因');
    return this.enrichBatchDetail(
      await this.production.cancelBatch(id, version, normalizedReason, audit),
    );
  }
  private requireProduct<T>(result: ProductQueryResult<T>): T {
    if (result.status === 'success') return result.value;
    throw new ProductionDomainError(
      result.status === 'not-found' ? 'NOT_FOUND' : 'INVALID_INPUT',
      result.message,
    );
  }
  private async enrichWorkOrder(workOrder: WorkOrderDetail): Promise<WorkOrderDetail> {
    const names = await this.resolveUserNames([
      workOrder.workOrderOwnerId,
      workOrder.cancelledBy,
      workOrder.closedBy,
    ]);
    return {
      ...workOrder,
      ownerName: workOrder.workOrderOwnerId
        ? (names.get(workOrder.workOrderOwnerId) ?? null)
        : null,
      cancelledByName: workOrder.cancelledBy ? (names.get(workOrder.cancelledBy) ?? null) : null,
      closedByName: workOrder.closedBy ? (names.get(workOrder.closedBy) ?? null) : null,
      batches: await this.enrichBatches(workOrder.batches ?? []),
    };
  }

  private async enrichBatches(batches: ProductionBatchItem[]): Promise<ProductionBatchItem[]> {
    const names = await this.resolveUserNames(batches.map((batch) => batch.ownerId));
    const routes = await this.draftRouteReferences(batches);
    return batches.map((batch) => {
      const route =
        batch.status === 'draft' && batch.routeId ? routes.get(batch.routeId) : undefined;
      return {
        ...batch,
        routeCode: route?.routeCode ?? batch.routeCode,
        routeVersion: route?.versionNo ?? batch.routeVersion,
        ownerName: batch.ownerId ? (names.get(batch.ownerId) ?? null) : null,
      };
    });
  }

  private async enrichBatchDetail(batch: ProductionBatchDetail): Promise<ProductionBatchDetail> {
    const names = await this.resolveUserNames([
      batch.ownerId,
      batch.startedById,
      batch.cancelledBy,
    ]);
    const routes = await this.draftRouteReferences([batch]);
    const route = batch.status === 'draft' && batch.routeId ? routes.get(batch.routeId) : undefined;
    return {
      ...batch,
      routeCode: route?.routeCode ?? batch.routeCode,
      routeVersion: route?.versionNo ?? batch.routeVersion,
      ownerName: batch.ownerId ? (names.get(batch.ownerId) ?? null) : null,
      startedByName: batch.startedById ? (names.get(batch.startedById) ?? null) : null,
      cancelledByName: batch.cancelledBy ? (names.get(batch.cancelledBy) ?? null) : null,
    };
  }

  private async draftRouteReferences(
    batches: ProductionBatchItem[],
  ): Promise<Map<string, ProcessRouteDisplayReference>> {
    const routeIds = [
      ...new Set(
        batches.flatMap((batch) =>
          batch.status === 'draft' && batch.routeId ? [batch.routeId] : [],
        ),
      ),
    ];
    if (routeIds.length === 0) return new Map();
    const routes = await this.products.listProcessRouteDisplayReferencesByIds(routeIds);
    return new Map(routes.map((route) => [route.id, route]));
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
      orderType: payload.orderType,
      previousResearchOrderId: payload.previousResearchOrderId ?? null,
      productId: payload.productId,
      plannedQuantity: payload.plannedQuantity,
      customerName: payload.customerName?.trim() || null,
      qualityLevel: payload.qualityLevel?.trim() || null,
      workOrderOwnerId: payload.workOrderOwnerId ?? null,
      planStartDate: payload.planStartDate,
      planEndDate: payload.planEndDate,
      externalOrderNo: payload.externalOrderNo?.trim() || null,
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
    }
    return Promise.all(
      overrides.map(async (override) => ({
        routeStepId: override.routeStepId,
        actualSop: override.actualSopFileId
          ? this.requireProduct(
              await this.products.getEnabledSopFileSnapshot(override.actualSopFileId!),
            )
          : null,
      })),
    );
  }
}
