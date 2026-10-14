import type { PageQuery } from './common.js';
import type { InventoryInboundTarget } from './production/inventory-target.js';

export type OtherInventoryDirection = 'inbound' | 'outbound';
export type OtherInventoryStatus = 'pending' | 'pending_picking' | 'completed' | 'cancelled';
export type OtherInventoryItemKind = 'material' | 'finished_product';
export interface OtherInventoryLinePayload {
  id?: string;
  itemKind: OtherInventoryItemKind;
  materialVariantId?: string;
  productId?: string;
  quantity: number;
  target: InventoryInboundTarget;
  remark?: string | null;
}
export interface OtherInventoryDraftPayload {
  reason: string;
  remark?: string | null;
  details: OtherInventoryLinePayload[];
}
export interface SaveOtherInventoryDraftPayload extends OtherInventoryDraftPayload {
  version: number;
}
export interface OtherInventoryOrderQuery extends PageQuery {
  keyword?: string;
  status?: OtherInventoryStatus;
}
export interface OtherInventoryLine {
  id: string;
  lineNo: number;
  itemKind: OtherInventoryItemKind;
  itemId: string | null;
  materialVariantId: string | null;
  productId: string | null;
  itemCode: string;
  itemName: string;
  materialVariantCode: string | null;
  unit: string;
  quantity: string;
  targetMode: 'new' | 'existing';
  newBatchKey: string | null;
  batchId: string | null;
  batchCode: string | null;
  remark: string | null;
  isDeleted: boolean;
  inventoryTransactionId: string | null;
}
export interface OtherInventoryOrder {
  id: string;
  orderNo: string;
  direction: OtherInventoryDirection;
  status: OtherInventoryStatus;
  version: number;
  reason: string;
  remark: string | null;
  details: OtherInventoryLine[];
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  operatorId: string | null;
  operatorName: string | null;
  confirmedAt: string | null;
  cancelReason: string | null;
  cancelledById: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
}
export interface OtherStockCandidateQuery extends PageQuery {
  direction: OtherInventoryDirection;
  itemKind?: OtherInventoryItemKind;
  materialVariantId?: string;
  productId?: string;
  keyword?: string;
}
export interface OtherStockCandidate {
  batchId: string;
  batchCode: string;
  itemKind: OtherInventoryItemKind;
  itemId: string | null;
  materialVariantId: string | null;
  productId: string | null;
  itemCode: string;
  itemName: string;
  materialVariantCode: string | null;
  unit: string;
  availableQuantity: string;
  reservedQuantity: string;
  usableQuantity: string;
}
export interface OtherStockObjectQuery {
  itemKind: OtherInventoryItemKind;
  materialId?: string;
  keyword?: string;
  includeIds?: string[];
}
export interface OtherStockMaterialQuery {
  keyword?: string;
  includeIds?: string[];
}
export interface OtherStockMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
}
export interface OtherStockMaterials {
  items: OtherStockMaterial[];
  hasMore: boolean;
}
export interface OtherStockObject {
  id: string;
  itemKind: OtherInventoryItemKind;
  itemId: string | null;
  materialVariantId: string | null;
  productId: string | null;
  code: string;
  name: string;
  materialVariantCode: string | null;
  unit: string;
}
export interface OtherStockObjects {
  items: OtherStockObject[];
  hasMore: boolean;
}
