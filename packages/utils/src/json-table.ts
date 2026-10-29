import type { JsonTableColumn, JsonTableData } from '@company/contracts';

const COLUMN_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const RESERVED_COLUMN_KEYS = new Set(['constructor', 'prototype', '__proto__']);
const MAX_COLUMNS = 20;
const MAX_ROWS = 200;
const MAX_LABEL_LENGTH = 100;
const MAX_CELL_LENGTH = 1000;

/** 校验并复制轻量 JSON 表格；单元格文本不做 trim。 */
export function normalizeJsonTable(value: unknown): JsonTableData {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== 'columns' && key !== 'rows') ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.rows)
  )
    throw new Error('表格必须包含 columns 列定义和 rows 行数据');
  if (value.columns.length > MAX_COLUMNS) throw new Error('表格最多支持 20 列');
  if (value.rows.length > MAX_ROWS) throw new Error('表格最多支持 200 行');
  if (value.columns.length === 0 && value.rows.length !== 0)
    throw new Error('没有列定义的表格不能包含行数据');

  const keys = new Set<string>();
  const columns: JsonTableColumn[] = Array.from(value.columns, (column: unknown) => {
    if (
      !isRecord(column) ||
      Object.keys(column).some((key) => key !== 'key' && key !== 'label') ||
      typeof column.key !== 'string' ||
      !COLUMN_KEY.test(column.key) ||
      RESERVED_COLUMN_KEYS.has(column.key)
    )
      throw new Error(
        '列标识须以英文字母开头，由字母、数字或下划线组成，最多 64 个字符且不能使用保留名称',
      );
    if (keys.has(column.key)) throw new Error(`列标识“${column.key}”重复`);
    if (typeof column.label !== 'string') throw new Error('列名称必须是文本');
    const label = column.label.trim();
    if (!label || [...label].length > MAX_LABEL_LENGTH)
      throw new Error('列名称必填且不能超过 100 个字符');
    keys.add(column.key);
    return { key: column.key, label };
  });

  const rows: Record<string, string>[] = Array.from(
    value.rows,
    (row: unknown, rowIndex: number) => {
      if (!isRecord(row)) throw new Error(`第 ${rowIndex + 1} 行必须是 JSON 对象`);
      if (Object.keys(row).some((key) => !keys.has(key)))
        throw new Error(`第 ${rowIndex + 1} 行包含未定义的列`);
      const normalized: Record<string, string> = {};
      for (const column of columns) {
        const cell: unknown = Object.hasOwn(row, column.key) ? row[column.key] : '';
        if (typeof cell !== 'string')
          throw new Error(`第 ${rowIndex + 1} 行的“${column.label}”必须是文本`);
        if ([...cell].length > MAX_CELL_LENGTH)
          throw new Error(`第 ${rowIndex + 1} 行的“${column.label}”不能超过 1000 个字符`);
        normalized[column.key] = cell;
      }
      return normalized;
    },
  );
  return { columns, rows };
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
