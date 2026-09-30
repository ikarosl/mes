import { Injectable } from '@nestjs/common';
import type {
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundCandidateQuery,
  ConfirmFinishedGoodsInboundPayload,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionFinishedInboundRepository } from './ports/production-finished-inbound.repository.js';
import { productionFinishedInboundResultCodec } from './idempotency/production-finished-inbound-result.codec.js';
import { CONFIRM_FINISHED_INBOUND_SCOPE } from './idempotency/production-idempotency-scopes.contract.js';
@Injectable()
export class ProductionFinishedInboundService {
  constructor(
    private readonly repository: ProductionFinishedInboundRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  async list(query: FinishedGoodsInboundQuery) {
    const page = await this.repository.list(query);
    const names = await this.names(page.items.map((row) => row.createdById));
    return {
      ...page,
      items: page.items.map((row) => ({
        ...row,
        createdByName: names.get(row.createdById) ?? row.createdById,
      })),
    };
  }
  candidates(query: FinishedGoodsInboundCandidateQuery) {
    return this.repository.candidates(query);
  }
  async get(id: string) {
    const row = await this.repository.get(id);
    const names = await this.names([
      row.createdById,
      ...row.details.flatMap((line) =>
        line.approvedOutput
          ? [line.approvedOutput.approvedBy, line.approvedOutput.snapshot.inspection.createdBy]
          : [],
      ),
    ]);
    return {
      ...row,
      createdByName: names.get(row.createdById) ?? row.createdById,
      details: row.details.map((line) => {
        const revision = line.approvedOutput;
        if (!revision) return line;
        const inspection = revision.snapshot.inspection;
        return {
          ...line,
          approvedOutput: {
            ...revision,
            approvedByName: names.get(revision.approvedBy) ?? revision.approvedBy,
            snapshot: {
              ...revision.snapshot,
              inspection: {
                ...inspection,
                createdByName: names.get(inspection.createdBy) ?? inspection.createdBy,
              },
            },
          },
        };
      }),
    };
  }
  async confirm(payload: ConfirmFinishedGoodsInboundPayload, context: IdempotentCommandContext) {
    for (const { target } of payload.details) {
      if (
        (target.mode === 'new' && 'batchId' in target && target.batchId !== undefined) ||
        (target.mode === 'existing' && 'clientKey' in target && target.clientKey !== undefined)
      )
        throw new ProductionDomainError('INVALID_INPUT', '请选择有效目标批次');
    }
    const body: ConfirmFinishedGoodsInboundPayload = {
      productionBatchId: payload.productionBatchId,
      details: payload.details.map((line) => ({
        detailKey: line.detailKey.trim(),
        allocationId: line.allocationId,
        revisionId: line.revisionId,
        quantity: line.quantity,
        target:
          line.target.mode === 'new'
            ? {
                mode: 'new',
                clientKey: line.target.clientKey.trim(),
              }
            : { mode: 'existing', batchId: line.target.batchId },
      })),
      remark: payload.remark?.trim() || null,
    };
    const execution = await this.idempotency.execute({
      scope: CONFIRM_FINISHED_INBOUND_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { body },
      resultCodec: productionFinishedInboundResultCodec,
      handler: () => this.repository.confirm(body, narrow(context)),
    });
    return execution.result;
  }
  private async names(ids: string[]) {
    return new Map(
      (await this.identity.listUserReferencesByIds([...new Set(ids)])).map((user) => [
        user.id,
        user.displayName,
      ]),
    );
  }
}
const narrow = ({ actorId, requestId, ip, userAgent }: CommandContext): CommandContext => ({
  actorId,
  requestId,
  ip,
  userAgent,
});
