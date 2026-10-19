import type { PageQuery } from '../common.js';

export type ProductItemKind = 'material' | 'finished_product';

export type ProductAcquireMethod = 'self_made' | 'outsourced' | 'purchased';
export type ProductBomStatus = 'draft' | 'pending_approval' | 'approved';

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
  unit: string;
  acquireMethod: ProductAcquireMethod;
  specValues: ProductSpecValue[];
  status: number;
  materialCount: number;
  bomLockedAt: string | null;
  bomLockedById: string | null;
  bomStatus: ProductBomStatus;
  bomApprovalInstanceId: string | null;
  version: number;
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
  acquireMethod: ProductAcquireMethod;
  unit: string;
}

export interface ProductMaterialItem {
  id: string;
  materialId: string;
  itemCode: string;
  productName: string;
  itemKind: ProductItemKind;
  quantityPerUnit: string;
  unit: string;
  status: number;
  remark: string | null;
}

export interface ProductMaterialPayload {
  materialId: string;
  quantityPerUnit: number;
  unit: string;
  status?: number;
  remark?: string | null;
}

/** 整份 BOM 替换命令；version 是读取成品时的聚合乐观锁版本。 */
export interface ReplaceProductMaterialsCommand {
  version: number;
  items: ProductMaterialPayload[];
}

/**
 * Exact stock/demand identity below one stable base material. The base material
 * remains the only BOM identity; these rows are selected only at demand time.
 */
export interface MaterialVariantListQuery extends PageQuery {
  materialId?: string;
  keyword?: string;
  status?: number;
}

export interface MaterialVariantItem {
  id: string;
  materialId: string;
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
  materialId: string;
  majorVersion: string;
  minorVersion: string;
  remark?: string | null;
}

export interface MaterialListQuery extends PageQuery {
  keyword?: string;
  categoryId?: string;
  acquireMethod?: ProductAcquireMethod;
  status?: number;
}

/** 基础物料分页行；版本明细通过单个基础物料的目录接口读取。 */
export interface MaterialListItem {
  id: string;
  materialCode: string;
  materialName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  unit: string;
  acquireMethod: ProductAcquireMethod;
  specValues: ProductSpecValue[];
  status: number;
  /** 未软删除的全部版本数，包含停用版本。 */
  variantCount: number;
  remark: string | null;
  updatedAt: string | null;
}

export interface MaterialPayload {
  materialCode: string;
  materialName: string;
  categoryId: string;
  unit: string;
  acquireMethod: ProductAcquireMethod;
  specValues?: ProductSpecValue[];
  status: number;
  remark?: string | null;
}

export interface MaterialOption {
  id: string;
  materialCode: string;
  materialName: string;
  acquireMethod: ProductAcquireMethod;
  unit: string;
}
