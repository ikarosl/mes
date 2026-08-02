import type {
  ProductListItem,
  ProductMaterialItem,
  ProductMaterialPayload,
  ProductListQuery,
  PageResult,
  ProductOption,
  ProductPayload,
} from '@company/contracts';
import type { AuditContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductCatalogRepository {
  abstract listProducts(query: ProductListQuery): Promise<PageResult<ProductListItem>>;
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
