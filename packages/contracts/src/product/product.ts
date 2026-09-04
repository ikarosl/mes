import type { PageQuery } from '../common.js';

export type ProductItemKind = 'material' | 'finished_product';

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
  materialCount: number;
  bomLockedAt: string | null;
  bomLockedById: string | null;
  remark: string | null;
  updatedAt: string | null;
}

export interface ProductPayload {
  /** 创建时必填；更新请求必须原样回传，服务端拒绝修改稳定编码。 */
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

export interface ProductMaterialPayload {
  materialProductId: string;
  quantityPerUnit: number;
  unit: string;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  status?: number;
  remark?: string | null;
}

/**
 * Exact stock/demand identity below one stable base material. The base product
 * remains the only BOM identity; these rows are selected only at demand time.
 */
export interface MaterialVariantListQuery extends PageQuery {
  materialProductId?: string;
  keyword?: string;
  status?: number;
}

export interface MaterialVariantItem {
  id: string;
  materialProductId: string;
  materialCode: string;
  materialName: string;
  majorVersion: string;
  minorVersion: string;
  variantCode: string;
  status: number;
  remark: string | null;
  updatedAt: string | null;
}

export interface MaterialVariantPayload {
  materialProductId: string;
  majorVersion: string;
  minorVersion: string;
  remark?: string | null;
}
