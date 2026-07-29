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
  WorkOrderQuery,
  UpdateWorkOrderPayload,
} from '@company/contracts';
import type { AuditContext } from '../../../../common/audit/audit.types.js';
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
  abstract getWorkOrder(id: string): Promise<WorkOrderDetail>;
  abstract createWorkOrder(
    payload: CreateWorkOrderPayload,
    product: ProductionProductSnapshot,
    audit: AuditContext,
  ): Promise<WorkOrderDetail>;
  abstract updateWorkOrder(
    id: string,
    payload: UpdateWorkOrderPayload,
    audit: AuditContext,
  ): Promise<WorkOrderDetail>;
  abstract transitionWorkOrder(
    id: string,
    action: 'release' | 'cancel' | 'close',
    version: number,
    audit: AuditContext,
  ): Promise<WorkOrderDetail>;
  abstract listBatches(query: ProductionBatchQuery): Promise<PageResult<ProductionBatchItem>>;
  abstract getBatch(id: string): Promise<ProductionBatchDetail>;
  abstract listWorkOrderBatches(workOrderId: string): Promise<ProductionBatchItem[]>;
  abstract createBatch(
    workOrderId: string,
    payload: CreateProductionBatchPayload,
    route: ProcessRouteSnapshot | null,
    stepOverrides: ResolvedBatchStepOverride[],
    audit: AuditContext,
  ): Promise<ProductionBatchDetail>;
  abstract updateBatch(
    id: string,
    payload: UpdateProductionBatchPayload,
    audit: AuditContext,
  ): Promise<ProductionBatchDetail>;
  abstract updateBatchStepExecution(
    batchId: string,
    recordId: string,
    payload: import('@company/contracts').UpdateBatchStepExecutionPayload,
    actualSop:
      { id: string; fileName: string; objectKey: string; versionNo: string } | null | undefined,
    audit: AuditContext,
  ): Promise<ProductionBatchDetail>;
  abstract generateMaterialDemands(
    batchId: string,
    version: number,
    bom: ProductBomSnapshot,
    audit: AuditContext,
  ): Promise<ProductionBatchDetail>;
  abstract getBatchProductId(batchId: string): Promise<string>;
  abstract getDefaultRouteId(workOrderId: string): Promise<string | null>;
}
