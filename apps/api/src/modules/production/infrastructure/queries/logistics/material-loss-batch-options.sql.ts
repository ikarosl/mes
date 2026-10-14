export const MATERIAL_LOSS_BATCH_OPTIONS_SQL = `SELECT DISTINCT pb.id,pb.batch_no,wo.work_order_no,
  wo.product_code_snapshot product_code,wo.product_name_snapshot product_name,pb.status
  FROM production_batches pb JOIN work_orders wo ON wo.id=pb.work_order_id
  JOIN production_item_allocation allocation ON allocation.production_batch_id=pb.id
  WHERE pb.status IN ('material_partially_outbound','material_outbound','doing')
    AND EXISTS (SELECT 1 FROM outbound_detail detail
      JOIN outbound_order outbound ON outbound.id=detail.outbound_id
      WHERE detail.allocation_id=allocation.id AND detail.is_deleted=0
        AND outbound.source_type='production_material' AND outbound.status='completed')
  ORDER BY pb.id DESC`;
