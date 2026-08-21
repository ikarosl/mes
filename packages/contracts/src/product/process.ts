import type { PageQuery } from '../common.js';

export type ProcessRouteStatus = 'draft' | 'enabled' | 'disabled' | 'archived';

export interface ProcessRouteQuery extends PageQuery {
  keyword?: string;
  status?: ProcessRouteStatus;
}

export interface ProcessStepQuery extends PageQuery {
  keyword?: string;
  status?: number;
}

export interface ProcessStepListItem {
  id: string;
  stepCode: string;
  stepName: string;
  description: string | null;
  defaultSopFileId: string | null;
  sopFileName: string | null;
  status: number;
  remark: string | null;
  updatedAt: string | null;
}

export interface ProcessStepOption {
  id: string;
  stepCode: string;
  stepName: string;
  sopFileName: string | null;
}

export interface ProcessStepPayload {
  stepCode: string;
  stepName: string;
  description?: string | null;
  status: number;
  remark?: string | null;
}

export interface ProcessRouteListItem {
  id: string;
  routeCode: string;
  routeName: string;
  productId: string;
  itemCode: string;
  productName: string;
  versionNo: string;
  status: ProcessRouteStatus;
  processSummary: string | null;
  stepCount: number;
  remark: string | null;
  updatedAt: string | null;
}

export interface ProcessRouteOption {
  id: string;
  routeCode: string;
  routeName: string;
  productId: string;
  versionNo: string;
  status: ProcessRouteStatus;
}

export interface ProcessRoutePayload {
  routeCode: string;
  routeName: string;
  productId: string;
  versionNo: string;
  remark?: string | null;
}

export interface ProcessRouteStepItem {
  id: string;
  processStepId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  description: string | null;
  defaultOwnerId: string | null;
  defaultOwnerName: string | null;
  sopFileId: string | null;
  sopFileName: string | null;
  needInspection: boolean;
  needRecord: boolean;
  status: number;
  remark: string | null;
  productMaterialIds: string[];
}

export interface ProcessRouteStepPayload {
  processStepId: string;
  stepOrder: number;
  defaultOwnerId?: string | null;
  sopFileId?: string | null;
  needInspection: boolean;
  needRecord: boolean;
  status?: number;
  remark?: string | null;
  productMaterialIds?: string[];
}
