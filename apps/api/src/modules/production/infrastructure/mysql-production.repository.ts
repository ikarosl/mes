import type { WorkOrderReleaseContext } from '../application/ports/production.repository.js';
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
  ProductionBatchStepRecords,
  ProductionStepCommandResult,
  UpdateBatchStepExecutionPayload,
  UpdateProductionBatchPayload,
  UpdateWorkOrderPayload,
  WorkOrderDetail,
  WorkOrderItem,
  WorkOrderOption,
  WorkOrderQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import type { ProcessRouteSnapshot, ProductionProductSnapshot } from '../../product/public.js';
import {
  ProductionRepository,
  type ResolvedBatchStepOverride,
} from '../application/ports/production.repository.js';
import { MysqlProductionBatchRepository } from './mysql-production-batch.repository.js';
import { MysqlWorkOrderRepository } from './mysql-work-order.repository.js';

/**
 * application 端口的组合根。SQL 与事务关注点分别保留在工单和生产批次适配器中，
 * 并按业务能力进行分组。
 */
@Injectable()
export class MysqlProductionRepository extends ProductionRepository {
  constructor(
    private readonly workOrders: MysqlWorkOrderRepository,
    private readonly batches: MysqlProductionBatchRepository,
  ) {
    super();
  }

  listWorkOrders(query: WorkOrderQuery): Promise<PageResult<WorkOrderItem>> {
    return this.workOrders.list(query);
  }
  listWorkOrderOptions(): Promise<WorkOrderOption[]> {
    return this.workOrders.listWorkOrderOptions();
  }
  getWorkOrder(id: string): Promise<WorkOrderDetail> {
    return this.workOrders.get(id);
  }
  createWorkOrder(
    payload: CreateWorkOrderPayload,
    product: ProductionProductSnapshot,
    audit: CommandContext,
  ): Promise<WorkOrderDetail> {
    return this.workOrders.create(payload, product, audit);
  }
  updateWorkOrder(
    id: string,
    payload: UpdateWorkOrderPayload,
    product: ProductionProductSnapshot | undefined,
    audit: CommandContext,
  ): Promise<WorkOrderDetail> {
    return this.workOrders.update(id, payload, product, audit);
  }
  withWorkOrderReleaseTransaction<T>(
    workOrderId: string,
    action: (workOrder: WorkOrderReleaseContext) => Promise<T>,
  ): Promise<T> {
    return this.workOrders.withReleaseTransaction(workOrderId, action);
  }
  releaseWorkOrder(
    id: string,
    version: number,
    product: ProductionProductSnapshot,
    audit: CommandContext,
  ): Promise<WorkOrderDetail> {
    return this.workOrders.release(id, version, product, audit);
  }
  cancelWorkOrder(
    id: string,
    version: number,
    reason: string,
    audit: CommandContext,
  ): Promise<WorkOrderDetail> {
    return this.workOrders.cancel(id, version, reason, audit);
  }
  completeWorkOrder(id: string, version: number, audit: CommandContext): Promise<WorkOrderDetail> {
    return this.workOrders.complete(id, version, audit);
  }
  closeWorkOrder(
    id: string,
    version: number,
    reason: string | null,
    audit: CommandContext,
  ): Promise<WorkOrderDetail> {
    return this.workOrders.close(id, version, reason, audit);
  }
  listBatches(query: ProductionBatchQuery): Promise<PageResult<ProductionBatchItem>> {
    return this.batches.list(query);
  }
  getBatch(id: string): Promise<ProductionBatchDetail> {
    return this.batches.get(id);
  }
  getBatchStepRecords(id: string): Promise<ProductionBatchStepRecords> {
    return this.batches.getStepRecords(id);
  }
  getBatchStartRecord(id: string): Promise<ProductionBatchStartRecord | null> {
    return this.batches.getStartRecord(id);
  }
  getBatchCancellationCheck(id: string): Promise<ProductionBatchCancellationCheck> {
    return this.batches.getCancellationCheck(id);
  }
  withBatchCreationTransaction<T>(
    workOrderId: string,
    action: (workOrderProductId: string, orderType: ProductionBatchItem['orderType']) => Promise<T>,
  ): Promise<T> {
    return this.batches.withBatchCreationTransaction(workOrderId, action);
  }
  createBatch(
    workOrderId: string,
    payload: CreateProductionBatchPayload,
    route: ProcessRouteSnapshot | null,
    stepOverrides: ResolvedBatchStepOverride[],
    audit: CommandContext,
  ): Promise<ProductionBatchDetail> {
    return this.batches.create(workOrderId, payload, route, stepOverrides, audit);
  }
  updateBatch(
    id: string,
    payload: UpdateProductionBatchPayload,
    audit: CommandContext,
  ): Promise<ProductionBatchDetail> {
    return this.batches.update(id, payload, audit);
  }
  cancelBatch(
    id: string,
    version: number,
    reason: string,
    audit: CommandContext,
  ): Promise<ProductionBatchDetail> {
    return this.batches.cancel(id, version, reason, audit);
  }
  updateBatchStepExecution(
    batchId: string,
    recordId: string,
    payload: UpdateBatchStepExecutionPayload,
    actualSop:
      { id: string; fileName: string; objectKey: string; versionNo: string } | null | undefined,
    audit: CommandContext,
  ): Promise<ProductionStepCommandResult> {
    return this.batches.updateStepExecution(batchId, recordId, payload, actualSop, audit);
  }
  getBatchProductId(batchId: string): Promise<string> {
    return this.batches.getProductId(batchId);
  }
  getWorkOrderProductId(workOrderId: string): Promise<string> {
    return this.workOrders.getProductId(workOrderId);
  }
}
