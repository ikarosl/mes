/**
 * Material identity presentation for screens that deal with physical stock.
 * `itemCode` is the stable BOM/base code; `materialVariantCode` is the exact
 * selectable/stock identity. A missing variant is intentionally visible as
 * “未选择版本” instead of silently pretending the base code is exact.
 */
export interface MaterialVariantDisplayRow {
  itemCode?: string | null;
  itemName?: string | null;
  materialVariantCode?: string | null;
}

export const baseMaterialCode = (row: MaterialVariantDisplayRow): string => row.itemCode || '—';

export const exactMaterialCode = (row: MaterialVariantDisplayRow): string =>
  row.materialVariantCode || '未选择版本';

export const exactMaterialLabel = (row: MaterialVariantDisplayRow): string =>
  `${exactMaterialCode(row)} · ${row.itemName || baseMaterialCode(row)}`;

/** Base code plus exact version, useful when both identities must be audited. */
export const materialIdentityLabel = (row: MaterialVariantDisplayRow): string =>
  row.materialVariantCode
    ? `${baseMaterialCode(row)} / ${row.materialVariantCode}`
    : `${baseMaterialCode(row)} / 未选择版本`;
