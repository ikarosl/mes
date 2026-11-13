/** Production HTTP幂等命名空间；Controller与应用服务共同引用，客户端仅发送Idempotency-Key。 */
export const SUBMIT_DEMAND_CORRECTION_SCOPE = 'production.demand-correction.submit.v3' as const;
export const CREATE_BATCH_IDEMPOTENCY_SCOPE = 'production.batch.create.v16' as const;
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
export const CREATE_WORK_ORDER_IDEMPOTENCY_SCOPE = 'production.work-order.create.v7' as const;

export const PRODUCTION_TRACKING_SCOPES = {
  create: 'production.tracking.create.v2',
  scan: 'production.tracking.scan.v2',
  'correct-quantity': 'production.tracking.correct-quantity.v2',
  void: 'production.tracking.void.v3',
  'abnormality.create': 'production.tracking.abnormality.create.v2',
  'abnormality.handle': 'production.tracking.abnormality.handle.v2',
  'confirm-output': 'production.tracking.confirm-output.v3',
  'confirm-research-output': 'production.tracking.confirm-research-output.v2',
  'task.start': 'production.tracking.task.start.v2',
  'task.finish': 'production.tracking.task.finish.v2',
  'task.reopen': 'production.tracking.task.reopen.v1',
} as const;

export const PRODUCTION_OUTPUT_SCOPES = {
  revoke: 'production.output.revoke.v1',
  inbound: 'production.output.inbound.v1',
} as const;
