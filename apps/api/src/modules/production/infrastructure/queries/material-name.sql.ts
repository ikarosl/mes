/**
 * Product 批准的展示读取：仅 materials.id/material_name，不过滤停用或软删除。
 * 固定外层表达式保证 SQL 不接受用户输入；名称不参与选版、状态或写入资格校验。
 * 相关子查询保留外层分页/锁序，可在 SELECT、搜索与排序中复用当前名称。
 */
const references = [
  'ib.item_id',
  'item_batch.item_id',
  'd.item_id',
  'demand.item_id',
  'matched.item_id',
  'identity.item_id',
  'production_item_demand.item_id',
  'production_material_requirement_basis.material_id',
] as const;

type MaterialReference = (typeof references)[number];

export const currentMaterialNameSql = (reference: MaterialReference): string => {
  if (!references.includes(reference)) throw new Error('Unsupported material display reference');
  return `(SELECT display_material.material_name FROM materials display_material WHERE display_material.id=${reference})`;
};
