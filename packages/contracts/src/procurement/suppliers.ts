import type { PageQuery, VersionedCommand } from '../common.js';

export interface SupplierItem {
  id: string;
  supplierName: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierQuery extends PageQuery {
  keyword?: string;
}

/** 远程窗口：关键词前 50 项，加上最多 100 个已选 ID 的显式解析结果。 */
export interface SupplierOptionQuery {
  keyword?: string;
  includeIds?: string[];
}

export interface SupplierOption {
  id: string;
  supplierName: string;
}

export interface CreateSupplierPayload {
  supplierName: string;
}

export interface UpdateSupplierPayload extends CreateSupplierPayload, VersionedCommand {}

export type ProcurementErrorCode =
  | 'SUPPLIER_NAME_TAKEN'
  | 'SUPPLIER_NOT_FOUND'
  | 'INVALID_SUPPLIER_NAME'
  | 'PURCHASE_ORDER_NOT_FOUND'
  | 'INVALID_PURCHASE_ORDER'
  | 'PURCHASE_ORDER_STATE'
  | 'PROCUREMENT_SOURCE_UNAVAILABLE'
  | 'RECEIPT_NOT_FOUND'
  | 'INVALID_RECEIPT'
  | 'RECEIPT_STATE';
