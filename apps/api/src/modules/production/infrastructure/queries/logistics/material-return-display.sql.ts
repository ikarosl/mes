import { currentMaterialNameSql } from '../shared/material-name.sql.js';

export const MATERIAL_RETURN_ORDER_SELECT = `SELECT ro.id,ro.inbound_no return_no,ro.production_batch_id,pb.batch_no,
  ro.work_order_id,wo.work_order_no,wo.product_code_snapshot product_code,
  wo.product_name_snapshot product_name,
  CASE WHEN ro.status='completed' THEN 'returned' ELSE ro.status END status,
  ro.inbound_at return_at,ro.operator_id,ro.created_by,ro.created_at,ro.version,ro.remark,
  ro.cancel_reason,ro.cancelled_by,ro.cancelled_at FROM inbound_order ro
  JOIN production_batches pb ON pb.id=ro.production_batch_id
  JOIN work_orders wo ON wo.id=ro.work_order_id`;

export const MATERIAL_RETURN_ORDER_COUNT = `SELECT COUNT(*) total FROM inbound_order ro
  JOIN production_batches pb ON pb.id=ro.production_batch_id
  JOIN work_orders wo ON wo.id=ro.work_order_id`;

export const materialReturnDetailsSql = (
  ids: string[],
): string => `SELECT rd.id,rd.inbound_id return_id,
  rd.return_allocation_id allocation_id,rd.demand_id,rd.item_id,rd.material_variant_id,rd.batch_id,
  rd.item_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,
  ib.material_variant_code_snapshot,ib.batch_code,rd.inbound_number return_number,
  rd.unit_snapshot,
  tx.id inventory_transaction_id,rd.remark
  FROM inbound_detail rd JOIN item_batch ib ON ib.id=rd.batch_id
  LEFT JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=rd.id
    AND tx.transaction_type='material_return_inbound'
  WHERE rd.source_type='return_inbound' AND rd.is_deleted=0
    AND rd.inbound_id IN (${ids.map(() => '?').join(',')}) ORDER BY rd.inbound_id,rd.id`;

export const MATERIAL_RETURN_BATCH_OPTIONS_SQL = `SELECT DISTINCT pb.id production_batch_id,pb.batch_no,wo.work_order_no,
  wo.product_code_snapshot product_code,wo.product_name_snapshot product_name
  FROM production_batches pb JOIN work_orders wo ON wo.id=pb.work_order_id
  JOIN production_item_allocation a ON a.production_batch_id=pb.id
  WHERE EXISTS (
    SELECT 1 FROM outbound_detail od JOIN outbound_order oo ON oo.id=od.outbound_id
    WHERE od.allocation_id=a.id AND oo.source_type='production_material' AND od.is_deleted=0
      AND oo.status='completed'
  ) ORDER BY pb.id DESC`;
