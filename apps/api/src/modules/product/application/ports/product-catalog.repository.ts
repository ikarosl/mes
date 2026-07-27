import type {
  ProductCategoryListItem,
  ProductCategoryPayload,
  ProductListItem,
  ProductMaterialItem,
  ProductMaterialPayload,
  ProductOption,
  ProductPayload,
} from '@company/contracts';
import type { AuditContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductCatalogRepository {
  abstract listCategories(): Promise<ProductCategoryListItem[]>;
  abstract createCategory(
    payload: ProductCategoryPayload,
    audit: AuditContext,
  ): Promise<{ id: string }>;
  abstract updateCategory(
    id: string,
    payload: ProductCategoryPayload,
    audit: AuditContext,
  ): Promise<void>;
  abstract setCategoryStatus(id: string, status: number, audit: AuditContext): Promise<void>;
  abstract listProducts(): Promise<ProductListItem[]>;
  abstract listProductOptions(): Promise<ProductOption[]>;
  abstract createProduct(payload: ProductPayload, audit: AuditContext): Promise<{ id: string }>;
  abstract updateProduct(id: string, payload: ProductPayload, audit: AuditContext): Promise<void>;
  abstract setProductStatus(id: string, status: number, audit: AuditContext): Promise<void>;
  abstract listMaterials(productId: string): Promise<ProductMaterialItem[]>;
  abstract replaceMaterials(
    productId: string,
    items: ProductMaterialPayload[],
    audit: AuditContext,
  ): Promise<void>;
  abstract setDefaultRoute(
    productId: string,
    routeId: string | null,
    audit: AuditContext,
  ): Promise<void>;
}
