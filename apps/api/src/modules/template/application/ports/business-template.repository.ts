import type {
  BusinessTemplateItem,
  BusinessTemplateListQuery,
  BusinessTemplatePayload,
  PageResult,
  UpdateBusinessTemplatePayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export interface BusinessTemplatePageQuery extends BusinessTemplateListQuery {
  page: number;
  pageSize: number;
}

export abstract class BusinessTemplateRepository {
  abstract list(query: BusinessTemplatePageQuery): Promise<PageResult<BusinessTemplateItem>>;
  abstract getById(id: string): Promise<BusinessTemplateItem | null>;
  abstract create(
    payload: BusinessTemplatePayload,
    context: CommandContext,
  ): Promise<BusinessTemplateItem>;
  abstract update(
    id: string,
    payload: UpdateBusinessTemplatePayload,
    context: CommandContext,
  ): Promise<BusinessTemplateItem>;
}
