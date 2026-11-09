/** Production HTTP幂等命名空间；Controller与应用服务共同引用，客户端仅发送Idempotency-Key。 */
export const SUBMIT_DEMAND_CORRECTION_SCOPE = 'production.demand-correction.submit.v3' as const;
export const CREATE_BATCH_IDEMPOTENCY_SCOPE = 'production.batch.create.v15' as const;
export const CREATE_MATERIAL_ALLOCATION_IDEMPOTENCY_SCOPE =
  'production.material-allocation.create.v2' as const;
export const CREATE_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE =
  'production.material-outbound.create.v5' as const;
export const CONFIRM_MATERIAL_OUTBOUND_IDEMPOTENCY_SCOPE =
  'production.material-outbound.confirm.v4' as const;
export const CONFIGURE_MATERIAL_DEMANDS_IDEMPOTENCY_SCOPE =
  'production.material-demands.configure.v3' as const;
export const ADD_MANUAL_MATERIAL_DEMAND_IDEMPOTENCY_SCOPE =
  'production.material-demands.add-manual.v4' as const;
export const CREATE_MATERIAL_LOSS_IDEMPOTENCY_SCOPE = 'production.material-loss.create.v4' as const;
export const CONFIRM_MATERIAL_LOSS_IDEMPOTENCY_SCOPE =
  'production.material-loss.confirm.v4' as const;
export const CREATE_WORK_ORDER_IDEMPOTENCY_SCOPE = 'production.work-order.create.v6' as const;

export const PRODUCTION_TRACKING_SCOPES = {
  create: 'production.tracking.create.v1',
  scan: 'production.tracking.scan.v1',
  'correct-quantity': 'production.tracking.correct-quantity.v1',
  void: 'production.tracking.void.v1',
  'abnormality.create': 'production.tracking.abnormality.create.v1',
  'abnormality.handle': 'production.tracking.abnormality.handle.v1',
  'confirm-output': 'production.tracking.confirm-output.v1',
  'confirm-research-output': 'production.tracking.confirm-research-output.v1',
  'task.start': 'production.tracking.task.start.v1',
  'task.finish': 'production.tracking.task.finish.v1',
} as const;
