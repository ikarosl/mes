import type {
  BusinessTemplateDefaultItem,
  BusinessTemplateSceneCode,
  JsonTableData,
} from '@company/contracts';

export interface BusinessTemplateSubmission {
  templateId: string;
  templateVersion: number;
  content: JsonTableData;
}

export abstract class BusinessTemplateSceneQuery {
  abstract getDefault(sceneCode: BusinessTemplateSceneCode): Promise<BusinessTemplateDefaultItem>;

  /** 必须在消费方同池活动事务中调用，校验期间锁定绑定及模板直到该事务结束。 */
  abstract validateSubmission(
    sceneCode: BusinessTemplateSceneCode,
    input: BusinessTemplateSubmission,
  ): Promise<JsonTableData>;
}
