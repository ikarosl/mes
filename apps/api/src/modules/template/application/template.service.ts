import { Injectable } from '@nestjs/common';
import { BUSINESS_TEMPLATE_STATUSES } from '@company/constants';
import type {
  BusinessTemplateItem,
  BusinessTemplateListQuery,
  BusinessTemplatePayload,
  JsonTableData,
  PageResult,
  UpdateBusinessTemplatePayload,
} from '@company/contracts';
import { normalizeJsonTable } from '@company/utils';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { TemplateDomainError } from '../domain/template.errors.js';
import { BusinessTemplateRepository } from './ports/business-template.repository.js';

@Injectable()
export class TemplateService {
  constructor(private readonly repository: BusinessTemplateRepository) {}

  list(query: BusinessTemplateListQuery): Promise<PageResult<BusinessTemplateItem>> {
    return this.repository.list({
      ...query,
      keyword: query.keyword?.trim() || undefined,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
    });
  }

  async getById(id: string): Promise<BusinessTemplateItem> {
    this.requireId(id);
    const item = await this.repository.getById(id);
    if (!item) throw new TemplateDomainError('NOT_FOUND', '业务模板不存在或已删除');
    return item;
  }

  create(payload: BusinessTemplatePayload, context: CommandContext): Promise<BusinessTemplateItem> {
    this.requireActorContext(context);
    this.requireStatus(payload.status);
    return this.repository.create(
      {
        ...payload,
        name: this.normalizeName(payload.name),
        content: this.normalizeContent(payload.content),
      },
      context,
    );
  }

  update(
    id: string,
    payload: UpdateBusinessTemplatePayload,
    context: CommandContext,
  ): Promise<BusinessTemplateItem> {
    this.requireId(id);
    this.requireActorContext(context);
    if (!Number.isInteger(payload.version) || payload.version < 0 || payload.version > 2147483646)
      throw new TemplateDomainError('VALIDATION_ERROR', '模板版本无效，请刷新后重试');
    if (payload.name === undefined && payload.content === undefined && payload.status === undefined)
      throw new TemplateDomainError('VALIDATION_ERROR', '请提供需要修改的模板内容');
    if (payload.status !== undefined) this.requireStatus(payload.status);
    return this.repository.update(
      id,
      {
        ...payload,
        ...(payload.name === undefined ? {} : { name: this.normalizeName(payload.name) }),
        ...(payload.content === undefined
          ? {}
          : { content: this.normalizeContent(payload.content) }),
      },
      context,
    );
  }

  private requireId(id: string): void {
    if (!/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 18446744073709551615n)
      throw new TemplateDomainError('VALIDATION_ERROR', '模板 ID 格式不正确');
  }

  private requireActorContext(context: CommandContext): void {
    if (!context.actorId)
      throw new TemplateDomainError('FORBIDDEN', '本次操作的用户信息无效，请重新登录');
  }

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized || [...normalized].length > 100)
      throw new TemplateDomainError('VALIDATION_ERROR', '模板名称不能为空且不能超过 100 个字符');
    return normalized;
  }

  private normalizeContent(content: unknown): JsonTableData {
    let normalized: JsonTableData;
    try {
      normalized = normalizeJsonTable(content);
    } catch (error) {
      if (error instanceof Error) throw new TemplateDomainError('VALIDATION_ERROR', error.message);
      throw error;
    }
    if (normalized.columns.length === 0)
      throw new TemplateDomainError('VALIDATION_ERROR', '模板至少需要定义一列');
    return normalized;
  }

  private requireStatus(status: unknown): void {
    if (!BUSINESS_TEMPLATE_STATUSES.some((item) => item === status))
      throw new TemplateDomainError('VALIDATION_ERROR', '模板状态无效');
  }
}
