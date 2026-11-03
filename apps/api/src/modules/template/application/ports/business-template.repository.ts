import type {
  BusinessTemplateDefaultItem,
  BusinessTemplateItem,
  BusinessTemplateListQuery,
  BusinessTemplatePayload,
  BusinessTemplateSceneCode,
  PageResult,
  UpdateBusinessTemplatePayload,
  UpdateBusinessTemplateDefaultPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { BusinessTemplateSceneQuery } from './business-template-scene.query.js';

export interface BusinessTemplatePageQuery extends BusinessTemplateListQuery {
  page: number;
  pageSize: number;
}

export abstract class BusinessTemplateRepository extends BusinessTemplateSceneQuery {
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
  abstract listDefaults(): Promise<BusinessTemplateDefaultItem[]>;
  abstract updateDefault(
    sceneCode: BusinessTemplateSceneCode,
    payload: UpdateBusinessTemplateDefaultPayload,
    context: CommandContext,
  ): Promise<BusinessTemplateDefaultItem>;
}
