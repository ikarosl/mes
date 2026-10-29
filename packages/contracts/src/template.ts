import type { PageQuery } from './common.js';

export type BusinessTemplateStatus = 'enabled' | 'disabled';

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
  status: BusinessTemplateStatus;
}

export interface UpdateBusinessTemplatePayload {
  version: number;
  name?: string;
  content?: JsonTableData;
  status?: BusinessTemplateStatus;
}
