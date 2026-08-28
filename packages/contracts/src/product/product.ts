import type { PageQuery } from '../common.js';

export type ProductItemKind = 'material' | 'semi_finished' | 'finished_product';

export type ProductBomVersionStatus = 'draft' | 'published' | 'superseded';

export type ProductAcquireMethod = 'self_made' | 'outsourced' | 'purchased';

export interface ProductListQuery extends PageQuery {
  keyword?: string;
  categoryId?: string;
  acquireMethod?: ProductAcquireMethod;
  status?: number;
}

export interface ProductCategoryQuery extends PageQuery {
  categoryCode?: string;
  categoryName?: string;
  status?: number;
}

export interface ProductCategoryListItem {
  id: string;
  parentId: string | null;
  categoryCode: string;
  categoryName: string;
  itemKind: ProductItemKind;
  status: number;
  remark: string | null;
  updatedAt: string | null;
}

export interface ProductCategoryOption {
  id: string;
  categoryCode: string;
  categoryName: string;
  itemKind: ProductItemKind;
}

export interface ProductCategoryPayload {
  parentId?: string | null;
  categoryCode: string;
  categoryName: string;
  itemKind: ProductItemKind;
  status: number;
  remark?: string | null;
}

export interface ProductSpecValue {
  key: string;
  value: string;
  unit?: string;
}

export interface ProductListItem {
  id: string;
  itemCode: string;
  productName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  itemKind: ProductItemKind;
  defaultRouteId: string | null;
  defaultRouteName: string | null;
  unit: string;
  acquireMethod: ProductAcquireMethod;
  specValues: ProductSpecValue[];
  status: number;
  currentBomVersionId: string | null;
  currentBomVersionNo: string | null;
  currentBomLineCount: number;
  remark: string | null;
  updatedAt: string | null;
}

export interface ProductPayload {
  itemCode: string;
  productName: string;
  categoryId: string;
  unit: string;
  acquireMethod: ProductAcquireMethod;
  specValues?: ProductSpecValue[];
  status: number;
  remark?: string | null;
}

export interface ProductOption {
  id: string;
  itemCode: string;
  productName: string;
  itemKind: ProductItemKind;
  acquireMethod: ProductAcquireMethod;
  unit: string;
  defaultRouteId: string | null;
}

export interface ProductMaterialItem {
  id: string;
  materialProductId: string;
  itemCode: string;
  productName: string;
  itemKind: ProductItemKind;
  quantityPerUnit: string;
  unit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  status: number;
  remark: string | null;
}

export interface ProductBomVersionListItem {
  id: string;
  productId: string;
  versionNo: string;
  status: ProductBomVersionStatus;
  lineCount: number;
  isCurrent: boolean;
  changeReason: string | null;
  remark: string | null;
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProductBomVersionProductSummary {
  id: string;
  itemCode: string;
  productName: string;
  unit: string;
}

export interface ProductBomVersionLineItem {
  id: string;
  lineNo: number;
  materialProductId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantityPerUnit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  remark: string | null;
}

export interface ProductBomVersionDetail extends ProductBomVersionListItem {
  product: ProductBomVersionProductSummary;
  lines: ProductBomVersionLineItem[];
}

export interface ReplaceProductBomVersionLinesPayload {
  items: Array<{
    materialProductId: string;
    quantityPerUnit: number;
    isKeyMaterial: boolean;
    needBatchRecord: boolean;
    remark?: string | null;
  }>;
}

export interface PublishProductBomVersionPayload {
  changeReason: string;
  outputCompatibilityConfirmed: true;
}
