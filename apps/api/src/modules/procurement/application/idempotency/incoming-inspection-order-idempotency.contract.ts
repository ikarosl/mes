import { z } from 'zod';
import type {
  CreateQualityIncomingInspectionOrderResult,
  QualityIncomingInspectionAssociationResult,
  QualityIncomingInspectionOrderItem,
} from '@company/contracts';
import type { IdempotencyResultCodec } from '../../../../common/idempotency/idempotency-executor.js';

export const CREATE_INCOMING_INSPECTION_ORDER_SCOPE =
  'quality.incoming-inspection-order.create.v1' as const;
export const CHANGE_INCOMING_INSPECTION_ASSOCIATIONS_SCOPE =
  'quality.incoming-inspection-order.associations.v1' as const;
export const UPDATE_INCOMING_INSPECTION_ORDER_SCOPE =
  'quality.incoming-inspection-order.remark.v1' as const;

const id = z.string().regex(/^[1-9]\d*$/);
const version = z.number().int().min(0).max(2147483647);
const orderReference = z.object({ id, inspectionNo: z.string().min(1), version }).strict();
const order = orderReference
  .extend({
    remark: z.string().nullable(),
    createdBy: id,
    createdAt: z.string(),
    updatedBy: id,
    updatedAt: z.string(),
  })
  .strict();
const associations = z
  .object({
    affectedOrders: z.array(orderReference),
    changes: z.array(
      z.object({ receiptId: id, fromOrderId: id.nullable(), toOrderId: id.nullable() }).strict(),
    ),
  })
  .strict();
const creation = associations.extend({ order }).strict();

export const incomingInspectionOrderCodec = {
  encode: (value) => order.parse(value),
  decode: (value) => order.parse(value),
} satisfies IdempotencyResultCodec<QualityIncomingInspectionOrderItem>;
export const incomingInspectionAssociationsCodec = {
  encode: (value) => associations.parse(value),
  decode: (value) => associations.parse(value),
} satisfies IdempotencyResultCodec<QualityIncomingInspectionAssociationResult>;
export const incomingInspectionOrderCreationCodec = {
  encode: (value) => creation.parse(value),
  decode: (value) => creation.parse(value),
} satisfies IdempotencyResultCodec<CreateQualityIncomingInspectionOrderResult>;
