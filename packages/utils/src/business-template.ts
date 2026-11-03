import { BUSINESS_TEMPLATE_COLUMN_MODE, BUSINESS_TEMPLATE_COLUMN_MODES } from '@company/constants';
import type { BusinessTemplateColumnRules, JsonTableData } from '@company/contracts';
import { normalizeJsonTable } from './json-table.js';

/** 旧模板保持自由复制；有规则时每列必须明确其设计或填写角色。 */
export function normalizeBusinessTemplateColumnRules(
  value: unknown,
  content: JsonTableData,
): BusinessTemplateColumnRules | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new Error('模板列规则必须是 JSON 对象');
  const table = normalizeJsonTable(content);
  const keys = new Set(table.columns.map((column) => column.key));
  if (Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key)))
    throw new Error('模板列规则必须与全部列标识一一对应');
  const rules: BusinessTemplateColumnRules = {};
  for (const column of table.columns) {
    const mode = BUSINESS_TEMPLATE_COLUMN_MODES.find(
      (candidate) => Object.hasOwn(value, column.key) && candidate === value[column.key],
    );
    if (!mode) throw new Error(`“${column.label}”的填写规则无效`);
    rules[column.key] = mode;
  }
  if (table.rows.length === 0) throw new Error('设置填写规则的模板至少需要一行');
  if (!Object.values(rules).some((mode) => mode !== BUSINESS_TEMPLATE_COLUMN_MODE.fixed))
    throw new Error('设置填写规则的模板至少需要一列必填或可空内容');
  return rules;
}

/** 仅接纳输入格的文本，列定义和固定格始终从可信模板重建。 */
export function validateTemplateTableInput(
  content: JsonTableData,
  rules: BusinessTemplateColumnRules | null,
  value: unknown,
): JsonTableData {
  const template = normalizeJsonTable(content);
  const normalizedRules = normalizeBusinessTemplateColumnRules(rules, template);
  if (!normalizedRules) throw new Error('该模板尚未设置填写规则，不能用于业务场景');
  const input = normalizeJsonTable(value);
  if (
    input.columns.length !== template.columns.length ||
    input.columns.some(
      (column, index) =>
        column.key !== template.columns[index]?.key ||
        column.label !== template.columns[index]?.label,
    ) ||
    input.rows.length !== template.rows.length
  )
    throw new Error('填写表格结构已变化，请重新加载默认模板后填写');
  let hasInput = false;
  const rows = template.rows.map((preset, rowIndex) => {
    const row: Record<string, string> = {};
    for (const column of template.columns) {
      const cell = input.rows[rowIndex]?.[column.key] ?? '';
      const mode = normalizedRules[column.key];
      if (mode === BUSINESS_TEMPLATE_COLUMN_MODE.fixed) {
        if (cell !== preset[column.key])
          throw new Error(`第 ${rowIndex + 1} 行的“${column.label}”为固定内容，请重新加载模板`);
        row[column.key] = preset[column.key] ?? '';
        continue;
      }
      if (mode === BUSINESS_TEMPLATE_COLUMN_MODE.required && cell.trim().length === 0)
        throw new Error(`请填写第 ${rowIndex + 1} 行的“${column.label}”`);
      if (cell.trim().length > 0) hasInput = true;
      row[column.key] = cell;
    }
    return row;
  });
  if (!hasInput) throw new Error('请至少填写一项实际内容，固定内容不计入填写');
  return { columns: template.columns.map((column) => ({ ...column })), rows };
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
