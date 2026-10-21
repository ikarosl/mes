/** 仅当前名称展示，不授予新建批次资格。 */
export const otherMaterialCodeSql = `(SELECT m.material_code FROM materials m WHERE m.id=d.item_id)`;
export const otherProductCodeSql = `(SELECT p.item_code FROM products p WHERE p.id=d.product_id)`;
export const otherMaterialNameSql = `(SELECT m.material_name FROM materials m WHERE m.id=d.item_id)`;
export const otherProductNameSql = `(SELECT p.product_name FROM products p WHERE p.id=d.product_id)`;
export const otherVariantCodeSql = `(SELECT v.variant_code FROM material_variants v WHERE v.id=d.material_variant_id)`;
export const otherInventoryIdentityDisplay = {
  columns: `COALESCE(${otherMaterialCodeSql},${otherProductCodeSql}) display_code,
    COALESCE(${otherMaterialNameSql},${otherProductNameSql}) display_name,${otherVariantCodeSql} display_variant_code`,
};
/** 候选数量只供展示，确认时通过公开端口当前读重验。 */
export const otherCandidateReservedSql = `(SELECT COALESCE(SUM(GREATEST(a.assigned_number-COALESCE((
    SELECT SUM(od.outbound_number) FROM outbound_detail od
    JOIN outbound_order oo ON oo.id=od.outbound_id
    WHERE od.allocation_id=a.id AND od.source_type='production_material'
      AND od.is_deleted=0 AND oo.status='completed'),0),0)),0)
  FROM production_item_allocation a WHERE a.batch_id=d.id
    AND a.allocation_status IN ('active','frozen','abnormal')
)`;
