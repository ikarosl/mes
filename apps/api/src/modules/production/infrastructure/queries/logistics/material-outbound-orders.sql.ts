export const MATERIAL_OUTBOUND_ORDER_SELECT = `SELECT o.id,o.outbound_no,o.production_batch_id,b.batch_no,o.work_order_id,
  wo.work_order_no,b.product_id,wo.product_code_snapshot product_code,wo.product_name_snapshot product_name,
  o.status,o.outbound_at,o.operator_id,o.created_by,o.created_at,o.version,o.remark,
  o.cancel_source,o.cancel_reason,o.cancelled_by,o.cancelled_at
  FROM outbound_order o
  JOIN production_batches b ON b.id=o.production_batch_id
  JOIN work_orders wo ON wo.id=o.work_order_id`;

export const MATERIAL_OUTBOUND_ORDER_COUNT = `SELECT COUNT(*) total FROM outbound_order o
  JOIN production_batches b ON b.id=o.production_batch_id
  JOIN work_orders wo ON wo.id=o.work_order_id`;
