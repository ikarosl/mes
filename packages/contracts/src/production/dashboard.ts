import type { PageQuery, PageResult } from '../common.js';
import type { ProductionBatchStatus } from './statuses.js';

export type ProductionDashboardOptionKind = 'work-orders' | 'tasks' | 'products';
export type ProductionDashboardOutputGroup = 'task' | 'day';
export type ProductionDashboardAbnormalityGroup = 'reason' | 'step';
export interface ProductionDashboardFilter extends PageQuery {
  workOrderId?: string;
  batchId?: string;
  productId?: string;
  keyword?: string;
  status?: ProductionBatchStatus;
}
export interface ProductionDashboardQuery extends ProductionDashboardFilter {
  startDate: string;
  endDate: string;
}
export interface ProductionDashboardOptionQuery extends ProductionDashboardFilter {
  search?: string;
  onlyInProgress?: boolean;
}
export interface ProductionDashboardOutputQuery extends ProductionDashboardQuery {
  groupBy: ProductionDashboardOutputGroup;
}
export interface ProductionDashboardAbnormalityQuery extends ProductionDashboardQuery {
  groupBy: ProductionDashboardAbnormalityGroup;
}
export interface ProductionDashboardOption {
  id: string;
  label: string;
}
export interface ProductionDashboardScheduleItem {
  workOrderId: string;
  workOrderNo: string;
  workOrderPlanStartDate: string | null;
  workOrderPlanEndDate: string | null;
  productId: string;
  productName: string;
  unit: string;
  batchId: string | null;
  batchNo: string | null;
  status: ProductionBatchStatus | null;
  plannedQuantity: string;
  planStartDate: string | null;
  planEndDate: string | null;
  startedAt: string | null;
  endedAt: string | null;
}
export interface ProductionDashboardStep {
  id: string;
  name: string;
  order: number;
  quantity: string;
  cardCount: number;
  oldestArrival: string | null;
  reportedQuantity: string;
}
export interface ProductionDashboardFlow {
  batch: ProductionDashboardScheduleItem;
  routeCode: string | null;
  asOf: string;
  steps: ProductionDashboardStep[];
  unusedQuantity: string;
  inProgressQuantity: string;
  outputQuantity: string;
}
export interface ProductionDashboardCard {
  id: string;
  cardNo: string;
  quantity: string;
  arrivedAt: string | null;
  personnelName: string;
  openAbnormalityCount: number;
}
export interface ProductionDashboardCardQuery extends PageQuery {
  stepId?: string;
}
export interface ProductionDashboardOutputItem {
  key: string;
  label: string;
  productId: string;
  productName: string;
  unit: string;
  plannedQuantity: string | null;
  outputQuantity: string;
}
export interface ProductionDashboardAbnormalityItem {
  key: string;
  label: string;
  count: number;
}
export interface ProductionDashboardAbnormalityResult extends PageResult<ProductionDashboardAbnormalityItem> {
  abnormalityCount: number;
}
export interface ProductionDashboardAbnormalityDetailQuery extends ProductionDashboardAbnormalityQuery {
  groupKey: string;
}
export interface ProductionDashboardAbnormalityDetail {
  id: string;
  cardId: string;
  cardNo: string;
  batchId: string;
  batchNo: string;
  description: string;
  stepName: string | null;
  createdAt: string;
}
export interface ProductionDashboardPeriodQuery {
  startDate: string;
  endDate: string;
  page?: number;
  pageSize?: number;
  stepId?: string;
}
export type ProductionDashboardFlowMode = 'current' | 'period';
export interface ProductionDashboardPeriodStep {
  id: string;
  name: string;
  order: number;
  arrivedCardCount: number;
  completedCardCount: number;
  reportedQuantity: string;
  abnormalityCount: number;
}
export interface ProductionDashboardPeriodFlow {
  batch: ProductionDashboardScheduleItem;
  routeCode: string | null;
  asOf: string;
  steps: ProductionDashboardPeriodStep[];
  outputQuantity: string;
  abnormalityCount: number;
}
export interface ProductionDashboardPeriodVisit {
  id: string;
  cardId: string;
  cardNo: string;
  stepName: string;
  arrivedAt: string;
  completedAt: string | null;
  arrivedInPeriod: boolean;
  completedInPeriod: boolean;
  reportedQuantity: string | null;
  personnelName: string;
}
