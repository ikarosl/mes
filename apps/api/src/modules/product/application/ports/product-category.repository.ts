import type {
  ProductCategoryListItem,
  ProductCategoryOption,
  ProductCategoryPayload,
  ProductCategoryQuery,
  PageResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductCategoryRepository {
  abstract listCategories(
    query: ProductCategoryQuery,
  ): Promise<PageResult<ProductCategoryListItem>>;
  abstract listCategoryOptions(): Promise<ProductCategoryOption[]>;
  abstract createCategory(
    payload: ProductCategoryPayload,
    audit: CommandContext,
  ): Promise<{ id: string }>;
  abstract updateCategory(
    id: string,
    payload: ProductCategoryPayload,
    audit: CommandContext,
  ): Promise<void>;
  abstract setCategoryStatus(id: string, status: number, audit: CommandContext): Promise<void>;
}
