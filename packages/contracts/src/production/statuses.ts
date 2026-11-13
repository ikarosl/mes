export type WorkOrderStatus = 'draft' | 'released' | 'doing' | 'completed' | 'cancelled' | 'closed';

export type ProductionBatchStatus =
  | 'draft'
  | 'pending'
  | 'material_pending'
  | 'material_assigned'
  | 'material_partially_outbound'
  | 'material_outbound'
  | 'doing'
  | 'completed'
  | 'cancelled';

export type InventorySourceType =
  | 'finished_product'
  | 'purchased'
  | 'outsourced'
  | 'return_inbound'
  | 'stock_check_generated'
  | 'other';

export type InventoryBatchStatus = 'available' | 'frozen' | 'disabled';

export type StockStatus = 'available' | 'pending_inspection' | 'frozen' | 'defective';

export type InventoryTransactionType =
  | 'purchase_inbound'
  | 'production_inbound'
  | 'outsourced_inbound'
  | 'production_material_outbound'
  | 'sales_outbound'
  | 'material_return_inbound'
  | 'scrap_outbound'
  | 'stock_check_adjustment'
  | 'status_transfer_in'
  | 'status_transfer_out'
  | 'other_inbound'
  | 'other_outbound';

export type InventoryReferenceType =
  | 'inbound_detail'
  | 'outbound_detail'
  | 'scrap'
  | 'stock_check_detail'
  | 'inspection_record'
  | 'manual';

export type InboundOrderStatus = 'pending' | 'completed' | 'cancelled';

export type DemandType = 'normal' | 'manual_additional';

/** 同一次需求生成动作的分组类型。 */
export type DemandGenerationGroupType = DemandType;

export type DemandBusinessStatus = 'active' | 'fulfilled' | 'cancelled' | 'closed';
export type DemandCloseCause =
  'correction_replaced' | 'correction_exhausted' | 'single_close' | 'task_finished';

/** 单条生产物料需求的分配/出库展示进度。 */
export type MaterialDemandProgressStatus =
  | 'pending_allocation'
  | 'partially_allocated'
  | 'allocated'
  | 'shortage'
  | 'partially_outbound'
  | 'outbound'
  | 'cancelled'
  | 'closed'
  | 'correction_pending';

export type AllocationStatus = 'active' | 'released' | 'cancelled' | 'frozen' | 'abnormal';

export type OutboundOrderStatus = 'pending_picking' | 'completed' | 'cancelled';

export type MaterialOutboundBlockedCode = 'allocation_incomplete' | 'no_orderable_allocation';

export type ReturnOrderStatus = 'pending' | 'returned' | 'cancelled';

export type ScrapStatus = 'pending' | 'confirmed' | 'cancelled';

export type StockCheckStatus = 'pending' | 'counting' | 'completed' | 'cancelled';

export type StockCheckResult = 'surplus' | 'shortage' | 'matched';
