import type { PageQuery } from './common.js';

export type BusinessTemplateStatus = 'enabled' | 'disabled';
export type BusinessTemplateColumnMode = 'fixed' | 'required' | 'optional';
export type BusinessTemplateColumnRules = Record<string, BusinessTemplateColumnMode>;
export type BusinessTemplateSceneCode = 'quality_incoming_inspection';

export interface JsonTableColumn {
  key: string;
  label: string;
}

export interface JsonTableData {
  /** 数组顺序即显示顺序。 */
  columns: JsonTableColumn[];
  rows: Record<string, string>[];
}

export interface BusinessTemplateItem {
  id: string;
  name: string;
  content: JsonTableData;
  /** null 为旧版自由复制模板，不推断填写规则。 */
  columnRules: BusinessTemplateColumnRules | null;
  status: BusinessTemplateStatus;
  /** 编辑并发版本，不是业务模板发布版本。 */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessTemplateListQuery extends PageQuery {
  status?: BusinessTemplateStatus;
  keyword?: string;
}

export interface BusinessTemplatePayload {
  name: string;
  content: JsonTableData;
  columnRules?: BusinessTemplateColumnRules | null;
  status: BusinessTemplateStatus;
}

export interface UpdateBusinessTemplatePayload {
  version: number;
  name?: string;
  content?: JsonTableData;
  columnRules?: BusinessTemplateColumnRules | null;
  status?: BusinessTemplateStatus;
}

export interface BusinessTemplateDefaultItem {
  id: string;
  sceneCode: BusinessTemplateSceneCode;
  templateId: string | null;
  version: number;
  template: BusinessTemplateItem | null;
}

export interface UpdateBusinessTemplateDefaultPayload {
  templateId: string;
  version: number;
}
