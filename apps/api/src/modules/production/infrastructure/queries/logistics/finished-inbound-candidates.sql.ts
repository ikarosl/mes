/** Presentation-only fact projection; command eligibility uses InventoryInboundCommand. */
export const finishedAllocationReceivedSql = (
  alias: string,
): string => `(SELECT COALESCE(SUM(tx.quantity),0)
 FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id
 JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
   AND tx.transaction_type='production_inbound' AND tx.product_id=d.product_id AND tx.batch_id=d.batch_id
   AND tx.quantity=d.inbound_number AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status
 WHERE d.production_output_allocation_id=${alias}.id AND o.status='completed' AND o.source_type='finished_product')`;
