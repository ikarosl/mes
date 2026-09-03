export type WorkOrderStatus = 'draft' | 'released' | 'doing' | 'completed' | 'cancelled' | 'closed';

export type ProductionBatchStatus =
  | 'pending'
  | 'material_pending'
  | 'material_assigned'
  | 'material_partially_outbound'
  | 'material_outbound'
  | 'doing'
  | 'completed'
  | 'cancelled';

export type BatchStepStatus = 'pending' | 'assigned' | 'doing' | 'completed';

export type BatchStepAbnormalDispositionType = 'rework' | 'scrap';

export type InventorySourceType =
  'self_made' | 'purchased' | 'outsourced' | 'return_inbound' | 'stock_check_generated' | 'other';

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
  | 'status_transfer_out';

export type InventoryReferenceType =
  | 'inbound_detail'
  | 'outbound_detail'
  | 'return_detail'
  | 'scrap'
  | 'stock_check_detail'
  | 'inspection_record'
  | 'manual';

export type InboundOrderStatus = 'pending' | 'completed' | 'cancelled';

export type DemandType =
  'normal' | 'manual_additional' | 'scrap_supplement' | 'material_loss_supplement';

/** 同一次需求生成动作的分组类型。 */
export type DemandGenerationGroupType = DemandType;

export type DemandBusinessStatus = 'active' | 'fulfilled' | 'cancelled';

/** 单条生产物料需求的分配/出库展示进度。 */
export type MaterialDemandProgressStatus =
  | 'pending_allocation'
  | 'partially_allocated'
  | 'allocated'
  | 'shortage'
  | 'partially_outbound'
  | 'outbound'
  | 'cancelled';

export type BatchStepAbnormalOrigin = 'current_step' | 'previous_step';

export type AllocationStatus = 'active' | 'released' | 'cancelled' | 'frozen' | 'abnormal';

export type OutboundOrderStatus =
  'pending_picking' | 'picked' | 'partially_outbound' | 'completed' | 'cancelled';

/** 短批授权窗口当前应提供的唯一业务动作。 */
export type ShortBatchAuthorizationAction =
  'authorize' | 'reauthorize' | 'adjust' | 'view' | 'not_required';

/** 当前物料缺口相对于既有短批授权快照的覆盖关系。 */
export type ShortBatchAuthorizationCoverage =
  'none' | 'covered' | 'insufficient' | 'stale' | 'consumed';

export type MaterialOutboundMode = 'normal' | 'short_batch';

export type MaterialOutboundBlockedCode =
  | 'allocation_incomplete'
  | 'short_batch_authorization_required'
  | 'short_batch_authorization_stale'
  | 'no_orderable_allocation';

export type BatchStepReportType = 'normal' | 'reversal';

export type BatchStepAbnormalReviewStatus =
  'pending_review' | 'approved' | 'rejected' | 'cancelled';

export type ReturnOrderStatus = 'pending' | 'returned' | 'scrapped' | 'cancelled';

export type ScrapScene =
  'warehouse_allocated' | 'return_after_outbound' | 'production_consumed' | 'in_stock';

export type ScrapStatus = 'pending' | 'confirmed' | 'cancelled';

export type StockCheckStatus = 'pending' | 'counting' | 'completed' | 'cancelled';

export type StockCheckResult = 'surplus' | 'shortage' | 'matched';

export type InspectionType = 'process' | 'final';

export type InspectionResult = 'pending' | 'passed' | 'failed' | 'conditional';

export type ReworkStatus = 'pending' | 'doing' | 'completed' | 'cancelled';

export type ReworkResult = 'pending' | 'passed' | 'failed';

export type FinishedFlowType =
  'warehouse_inbound' | 'quality_release' | 'warehouse_outbound' | 'other';

export type FinishedFlowStatus = 'confirmed' | 'cancelled';
