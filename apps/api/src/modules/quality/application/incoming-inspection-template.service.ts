import { Injectable } from '@nestjs/common';
import {
  BUSINESS_TEMPLATE_SCENE,
  BUSINESS_TEMPLATE_STATUS,
  QUALITY_INSPECTION_TEMPLATE_CHANGED,
} from '@company/constants';
import type {
  BusinessTemplateDefaultItem,
  JsonTableData,
  QualityInboundInspectionInput,
} from '@company/contracts';
import { BusinessTemplateSceneQuery, TemplateCommandError } from '../../template/public.js';
import { QualityCommandError } from '../quality-command.error.js';

@Injectable()
export class IncomingInspectionTemplateService {
  constructor(private readonly templates: BusinessTemplateSceneQuery) {}

  getDefault(): Promise<BusinessTemplateDefaultItem> {
    return this.execute(async () => {
      const result = await this.templates.getDefault(
        BUSINESS_TEMPLATE_SCENE.qualityIncomingInspection,
      );
      if (
        !result.template ||
        result.template.status !== BUSINESS_TEMPLATE_STATUS.enabled ||
        !result.template.columnRules ||
        result.template.content.rows.length === 0
      ) {
        throw new QualityCommandError(
          'INVALID_STATE',
          '来料检验默认模板尚未配置或不可用，请联系管理员在模板管理中设置',
        );
      }
      return result;
    });
  }

  /** 来源已开启事务；Template 在同一事务内核对默认绑定和模板规则。 */
  validate(input: QualityInboundInspectionInput): Promise<JsonTableData> {
    return this.execute(() =>
      this.templates.validateSubmission(BUSINESS_TEMPLATE_SCENE.qualityIncomingInspection, {
        templateId: input.inspectionTemplateId,
        templateVersion: input.inspectionTemplateVersion,
        content: input.inspectionDetails,
      }),
    );
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof TemplateCommandError)) throw error;
      if (error.code === 'CONFLICT')
        throw new QualityCommandError(QUALITY_INSPECTION_TEMPLATE_CHANGED, error.message);
      if (error.code === 'VALIDATION_ERROR')
        throw new QualityCommandError('INVALID_INPUT', error.message);
      throw new QualityCommandError('INVALID_STATE', error.message);
    }
  }
}
