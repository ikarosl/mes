import type { WorkOrderDetail, WorkOrderType } from '@company/contracts';

export interface WorkOrderFormValue {
  orderType: WorkOrderType;
  previousResearchOrderId: string | null;
  productId: string;
  plannedQuantity: number;
  workOrderOwnerId: string;
  customerName: string;
  qualityLevel: string;
  planStartDate: string;
  planEndDate: string;
  externalOrderNo: string;
  remark: string;
}

export interface WorkOrderFormHandle {
  setForm: (order: WorkOrderDetail) => void;
  resetForm: () => void;
  startNextRound: (order: WorkOrderDetail) => void;
}
