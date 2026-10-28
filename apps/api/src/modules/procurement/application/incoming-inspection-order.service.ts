import { Injectable } from '@nestjs/common';
import type {
  ChangeQualityIncomingInspectionAssociationsPayload,
  CreateQualityIncomingInspectionOrderPayload,
  UpdateQualityIncomingInspectionOrderPayload,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IncomingInspectionOrderRepository } from './ports/incoming-inspection-order.repository.js';
import {
  CHANGE_INCOMING_INSPECTION_ASSOCIATIONS_SCOPE,
  CREATE_INCOMING_INSPECTION_ORDER_SCOPE,
  UPDATE_INCOMING_INSPECTION_ORDER_SCOPE,
  incomingInspectionAssociationsCodec,
  incomingInspectionOrderCodec,
  incomingInspectionOrderCreationCodec,
} from './idempotency/incoming-inspection-order-idempotency.contract.js';

@Injectable()
export class IncomingInspectionOrderService {
  constructor(
    private readonly repository: IncomingInspectionOrderRepository,
    private readonly idempotency: IdempotencyExecutor,
  ) {}

  async create(
    payload: CreateQualityIncomingInspectionOrderPayload,
    context: IdempotentCommandContext,
  ) {
    const body: CreateQualityIncomingInspectionOrderPayload = {
      remark: payload.remark?.trim() || null,
      receipts: payload.receipts.map((receipt) => ({ ...receipt })),
      expectedOrders: payload.expectedOrders.map((order) => ({ ...order })),
    };
    return (
      await this.idempotency.execute({
        scope: CREATE_INCOMING_INSPECTION_ORDER_SCOPE,
        key: context.idempotencyKey,
        actorId: context.actorId,
        requestId: context.requestId,
        request: { body },
        resultCodec: incomingInspectionOrderCreationCodec,
        handler: () => this.repository.create(body, auditContext(context)),
      })
    ).result;
  }

  async changeAssociations(
    payload: ChangeQualityIncomingInspectionAssociationsPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      changes: payload.changes.map((change) => ({ ...change })),
      expectedOrders: payload.expectedOrders.map((order) => ({ ...order })),
    };
    return (
      await this.idempotency.execute({
        scope: CHANGE_INCOMING_INSPECTION_ASSOCIATIONS_SCOPE,
        key: context.idempotencyKey,
        actorId: context.actorId,
        requestId: context.requestId,
        request: { body },
        resultCodec: incomingInspectionAssociationsCodec,
        handler: () => this.repository.changeAssociations(body, auditContext(context)),
      })
    ).result;
  }

  async updateRemark(
    id: string,
    payload: UpdateQualityIncomingInspectionOrderPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      expectedVersion: payload.expectedVersion,
      remark: payload.remark?.trim() || null,
    };
    return (
      await this.idempotency.execute({
        scope: UPDATE_INCOMING_INSPECTION_ORDER_SCOPE,
        key: context.idempotencyKey,
        actorId: context.actorId,
        requestId: context.requestId,
        request: { params: { id }, body },
        resultCodec: incomingInspectionOrderCodec,
        handler: () => this.repository.updateRemark(id, body, auditContext(context)),
      })
    ).result;
  }
}

const auditContext = (context: IdempotentCommandContext): CommandContext => ({
  actorId: context.actorId,
  requestId: context.requestId,
  ip: context.ip,
  userAgent: context.userAgent,
});
