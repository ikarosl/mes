import type {
  ProductCategoryListItem,
  ProductCategoryOption,
  ProductCategoryPayload,
  ProductCategoryQuery,
  PageResult,
} from '@company/contracts';
import type { AuditContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductCategoryRepository {
  abstract listCategories(
    query: ProductCategoryQuery,
  ): Promise<PageResult<ProductCategoryListItem>>;
  abstract listCategoryOptions(): Promise<ProductCategoryOption[]>;
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
}
