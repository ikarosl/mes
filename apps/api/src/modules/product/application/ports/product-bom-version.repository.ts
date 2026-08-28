import type { ProductBomVersionDetail, ProductBomVersionListItem } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export interface ProductBomVersionLinePayload {
  materialProductId: string;
  quantityPerUnit: number;
  isKeyMaterial: boolean;
  needBatchRecord: boolean;
  remark?: string | null;
}

export abstract class ProductBomVersionRepository {
  abstract listByProduct(productId: string): Promise<ProductBomVersionListItem[]>;
  abstract getDetail(bomVersionId: string): Promise<ProductBomVersionDetail>;
  abstract createDraft(productId: string, audit: CommandContext): Promise<ProductBomVersionDetail>;
  abstract copyAsDraft(
    sourceVersionId: string,
    audit: CommandContext,
  ): Promise<ProductBomVersionDetail>;
  abstract replaceDraftLines(
    bomVersionId: string,
    lines: ProductBomVersionLinePayload[],
    audit: CommandContext,
  ): Promise<ProductBomVersionDetail>;
  abstract publish(
    bomVersionId: string,
    changeReason: string,
    audit: CommandContext,
  ): Promise<ProductBomVersionDetail>;
  abstract deleteDraft(bomVersionId: string, audit: CommandContext): Promise<void>;
}
