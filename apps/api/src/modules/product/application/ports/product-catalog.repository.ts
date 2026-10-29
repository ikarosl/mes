import type {
  ProductListItem,
  ProductMaterialItem,
  ReplaceProductMaterialsCommand,
  ProductListQuery,
  PageResult,
  ProductOption,
  ProductPayload,
  ProductUpdatePayload,
  BomApprovalSnapshot,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProductCatalogRepository {
  abstract listProducts(query: ProductListQuery): Promise<PageResult<ProductListItem>>;
  abstract listProductOptions(): Promise<ProductOption[]>;
  abstract createProduct(payload: ProductPayload, audit: CommandContext): Promise<{ id: string }>;
  abstract updateProduct(
    id: string,
    payload: ProductUpdatePayload,
    audit: CommandContext,
  ): Promise<void>;
  abstract setProductStatus(id: string, status: number, audit: CommandContext): Promise<void>;
  abstract listMaterials(productId: string): Promise<ProductMaterialItem[]>;
  abstract replaceMaterials(
    productId: string,
    command: ReplaceProductMaterialsCommand,
    audit: CommandContext,
  ): Promise<void>;
  abstract lockCurrentBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
  ): Promise<void>;
  abstract prepareBomApproval(
    productId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<{ title: string; subjectVersion: number; snapshot: BomApprovalSnapshot }>;
  abstract bindBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<number>;
  abstract finalizeBomApproval(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void>;
  abstract restoreBomAfterApprovalEnd(
    productId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void>;
  abstract listMaterialNames(materialIds: string[]): Promise<Record<string, string>>;
}
