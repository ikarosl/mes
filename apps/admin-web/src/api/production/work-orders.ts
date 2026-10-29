import type {
  CreateWorkOrderPayload,
  CancelWorkOrderPayload,
  CloseWorkOrderPayload,
  PageResult,
  UpdateWorkOrderPayload,
  WorkOrderDetail,
  WorkOrderItem,
  WorkOrderOption,
  WorkOrderQuery,
  UserOption,
} from '@company/contracts';
import { request } from './request';

export const productionWorkOrdersApi = {
  /** 分页查询生产工单 */
  listOrders: (params: WorkOrderQuery): Promise<PageResult<WorkOrderItem>> =>
    request<PageResult<WorkOrderItem>>({ url: '/production/work-orders', params }),

  workOrderOwnerOptions: (signal?: AbortSignal): Promise<UserOption[]> =>
    request<UserOption[]>({
      url: '/production/work-orders/owner-options',
      signal,
      skipErrorHandling: true,
    }),

  /** 任务表单工单候选：完整返回 released/doing 且仍有余量的工单，前端本地过滤 */
  workOrderOptions: (): Promise<WorkOrderOption[]> =>
    request<WorkOrderOption[]>({
      url: '/production/work-orders/options',
      skipErrorHandling: true,
    }),

  /** 获取工单详情（含生产批次） */
  getOrder: (id: string): Promise<WorkOrderDetail> =>
    request<WorkOrderDetail>({ url: `/production/work-orders/${id}` }),

  /** 创建工单 */
  createOrder: (data: CreateWorkOrderPayload, idempotencyKey: string): Promise<WorkOrderDetail> =>
    request<WorkOrderDetail>({
      url: '/production/work-orders',
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorHandling: true,
    }),

  /** 更新工单 */
  updateOrder: (id: string, data: UpdateWorkOrderPayload): Promise<WorkOrderDetail> =>
    request<WorkOrderDetail>({ url: `/production/work-orders/${id}`, method: 'PATCH', data }),

  /** 下达草稿工单 */
  releaseOrder: (id: string, version: number): Promise<WorkOrderDetail> =>
    request<WorkOrderDetail>({
      url: `/production/work-orders/${id}/actions/release`,
      method: 'POST',
      data: { version },
    }),

  /** 取消尚未下达的草稿工单 */
  cancelOrder: (id: string, data: CancelWorkOrderPayload): Promise<WorkOrderDetail> =>
    request<WorkOrderDetail>({
      url: `/production/work-orders/${id}/actions/cancel`,
      method: 'POST',
      data,
    }),

  /** 管理员显式确认工单足量完工 */
  completeOrder: (id: string, version: number): Promise<WorkOrderDetail> =>
    request<WorkOrderDetail>({
      url: `/production/work-orders/${id}/actions/complete`,
      method: 'POST',
      data: { version },
    }),

  /** 提前结案或完工后行政归档 */
  closeOrder: (id: string, data: CloseWorkOrderPayload): Promise<WorkOrderDetail> =>
    request<WorkOrderDetail>({
      url: `/production/work-orders/${id}/actions/close`,
      method: 'POST',
      data,
    }),
};
