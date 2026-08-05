import type {
  // BatchStepRecordItem,
  CreateProductionBatchPayload,
  CreateWorkOrderPayload,
  PageResult,
  ProductionBatchDetail,
  ProductionBatchItem,
  ProductionBatchQuery,
  UpdateProductionBatchPayload,
  WorkOrderDetail,
  WorkOrderItem,
  WorkOrderOption,
  WorkOrderQuery,
  UpdateWorkOrderPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type {
  ProcessRouteSnapshot,
  ProductBomSnapshot,
  ProductionProductSnapshot,
} from '../../../product/public.js';

export interface ResolvedBatchStepOverride {
  routeStepId: string;
  actualSop: { id: string; fileName: string; objectKey: string; versionNo: string } | null;
  responsibleUserId: string | null;
}

export abstract class ProductionRepository {
  abstract listWorkOrders(query: WorkOrderQuery): Promise<PageResult<WorkOrderItem>>;
  abstract listWorkOrderOptions(): Promise<WorkOrderOption[]>;
  abstract getWorkOrder(id: string): Promise<WorkOrderDetail>;
  abstract createWorkOrder(
    payload: CreateWorkOrderPayload,
    product: ProductionProductSnapshot,
    audit: CommandContext,
  ): Promise<WorkOrderDetail>;
  abstract updateWorkOrder(
    id: string,
    payload: UpdateWorkOrderPayload,
    product: ProductionProductSnapshot | undefined,
    audit: CommandContext,
  ): Promise<WorkOrderDetail>;
  abstract withWorkOrderReleaseTransaction<T>(
    workOrderId: string,
    action: (workOrderProductId: string) => Promise<T>,
  ): Promise<T>;
  abstract releaseWorkOrder(
    id: string,
    version: number,
    product: ProductionProductSnapshot,
    audit: CommandContext,
  ): Promise<WorkOrderDetail>;
  abstract transitionWorkOrder(
    id: string,
    action: 'cancel' | 'close',
    version: number,
    audit: CommandContext,
  ): Promise<WorkOrderDetail>;
  abstract listBatches(query: ProductionBatchQuery): Promise<PageResult<ProductionBatchItem>>;
  abstract getBatch(id: string): Promise<ProductionBatchDetail>;
  abstract listWorkOrderBatches(workOrderId: string): Promise<ProductionBatchItem[]>;
  abstract withBatchCreationTransaction<T>(
    workOrderId: string,
    action: (workOrderProductId: string) => Promise<T>,
  ): Promise<T>;
  abstract createBatch(
    workOrderId: string,
    payload: CreateProductionBatchPayload,
    route: ProcessRouteSnapshot | null,
    stepOverrides: ResolvedBatchStepOverride[],
    audit: CommandContext,
  ): Promise<ProductionBatchDetail>;
  abstract updateBatch(
    id: string,
    payload: UpdateProductionBatchPayload,
    audit: CommandContext,
  ): Promise<ProductionBatchDetail>;
  abstract updateBatchStepExecution(
    batchId: string,
    recordId: string,
    payload: import('@company/contracts').UpdateBatchStepExecutionPayload,
    actualSop:
      { id: string; fileName: string; objectKey: string; versionNo: string } | null | undefined,
    audit: CommandContext,
  ): Promise<ProductionBatchDetail>;
  abstract generateMaterialDemands(
    batchId: string,
    version: number,
    bom: ProductBomSnapshot,
    audit: CommandContext,
  ): Promise<ProductionBatchDetail>;
  abstract getBatchProductId(batchId: string): Promise<string>;
  abstract getWorkOrderProductId(workOrderId: string): Promise<string>;
}
