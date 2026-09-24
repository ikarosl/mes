import { normalizeFinishedInspectionFacts } from '../domain/finished-inspection.policy.js';
import { QualityCommandError } from '../quality-command.error.js';
import { Injectable } from '@nestjs/common';
import type {
  FinishedInspectionTaskQuery,
  PageQuery,
  ProductionOutputInspection,
  RecordFinishedInspectionPayload,
} from '@company/contracts';
import type { IdempotentCommandContext } from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { FinishedInspectionRepository } from './ports/finished-inspection.repository.js';
import {
  FINISHED_INSPECTION_RECORD_SCOPE,
  finishedInspectionResultCodec,
} from './idempotency/finished-inspection-idempotency.contract.js';
@Injectable()
export class FinishedInspectionService {
  constructor(
    private readonly repository: FinishedInspectionRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  listTasks(query: FinishedInspectionTaskQuery) {
    return this.repository.listTasks(query);
  }
  async detail(batchId: string) {
    const detail = await this.repository.detail(batchId);
    if (!detail) throw new QualityCommandError('NOT_FOUND', '成品质检任务不存在');
    return {
      ...detail,
      latestInspection: detail.latestInspection
        ? (await this.names([detail.latestInspection]))[0]!
        : null,
    };
  }
  async listRecords(batchId: string, query: PageQuery) {
    const page = await this.repository.listRecords(batchId, query);
    return { ...page, items: await this.names(page.items) };
  }
  private async names(records: ProductionOutputInspection[]) {
    const names = new Map(
      (
        await this.identity.listUserReferencesByIds([...new Set(records.map((r) => r.createdBy))])
      ).map((u) => [u.id, u.displayName]),
    );
    return records.map((r) => ({ ...r, createdByName: names.get(r.createdBy) ?? r.createdBy }));
  }
  async record(
    batchId: string,
    payload: RecordFinishedInspectionPayload,
    context: IdempotentCommandContext,
  ) {
    const body = {
      version: payload.version,
      ...normalizeFinishedInspectionFacts(payload),
      inspectedAt: payload.inspectedAt,
      resultNote: payload.resultNote.trim(),
      evidenceReference: payload.evidenceReference.trim(),
    };
    const { result } = await this.idempotency.execute({
      scope: FINISHED_INSPECTION_RECORD_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { batchId }, body },
      resultCodec: finishedInspectionResultCodec,
      handler: () =>
        this.repository.record(batchId, body, {
          actorId: context.actorId,
          requestId: context.requestId,
          ip: context.ip,
          userAgent: context.userAgent,
        }),
    });
    return result;
  }
}
