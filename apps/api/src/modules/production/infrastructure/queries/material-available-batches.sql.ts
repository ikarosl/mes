import { currentMaterialNameSql } from './material-name.sql.js';
export const AVAILABLE_MATERIAL_BATCHES_SQL = `SELECT ib.id,ib.item_id,ib.material_variant_id,ib.material_variant_code_snapshot,ib.item_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,ib.batch_code,ib.unit_snapshot,ib.source_type,ib.provider,ib.production_date,
       COALESCE(SUM(CASE WHEN it.stock_status='available' THEN it.quantity ELSE 0 END),0) on_hand,
       COALESCE((SELECT SUM(GREATEST(a.assigned_number-COALESCE((SELECT SUM(od.outbound_number) FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id WHERE od.allocation_id=a.id AND oo.status='completed'),0),0)) FROM production_item_allocation a WHERE a.batch_id=ib.id AND a.allocation_status NOT IN ('released','cancelled')),0) reserved
       FROM item_batch ib LEFT JOIN inventory_transaction it ON it.batch_id=ib.id AND it.item_id=ib.item_id AND it.material_variant_id=ib.material_variant_id
       WHERE ib.product_id IS NULL AND ib.item_id=? AND ib.material_variant_id=? AND ib.batch_status='available'
       GROUP BY ib.id
       HAVING on_hand > 0
       ORDER BY ib.id`;
