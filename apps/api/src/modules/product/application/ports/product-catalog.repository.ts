import type {
  ProductListItem,
  ProductMaterialItem,
  ProductListQuery,
  PageResult,
  ProductOption,
  ProductPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductCatalogRepository {
  abstract listProducts(query: ProductListQuery): Promise<PageResult<ProductListItem>>;
  abstract listProductOptions(): Promise<ProductOption[]>;
  abstract createProduct(payload: ProductPayload, audit: CommandContext): Promise<{ id: string }>;
  abstract updateProduct(id: string, payload: ProductPayload, audit: CommandContext): Promise<void>;
  abstract setProductStatus(id: string, status: number, audit: CommandContext): Promise<void>;
  abstract listMaterials(productId: string): Promise<ProductMaterialItem[]>;
  abstract setDefaultRoute(
    productId: string,
    routeId: string | null,
    audit: CommandContext,
  ): Promise<void>;
}
