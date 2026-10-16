import { Injectable } from '@nestjs/common';
import type {
  CreateProcessInspectionPayload,
  CorrectProcessInspectionPayload,
  ReverseProcessInspectionPayload,
  PageQuery,
  ProcessInspectionQuery,
  ProcessInspectionRecord,
  ProcessInspectionEntry,
  PageResult,
  ProcessInspectionStepSummary,
  ProcessInspectionCommandResult,
} from '@company/contracts';
import type {
  CommandContext,
  IdempotentCommandContext,
} from '../../../common/audit/audit.types.js';
import { IdempotencyExecutor } from '../../../common/idempotency/idempotency-executor.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { QualityCommandError } from '../quality-command.error.js';
import {
  normalizeProcessInspection,
  requireProcessInspectionText,
} from '../domain/process-inspection.policy.js';
import { ProcessInspectionRepository } from './ports/process-inspection.repository.js';
import type { QualityProcessInspectionQuery } from './quality-process-inspection.query.js';
import type { ProcessInspectionSource } from './quality-process-inspection.command.js';
import {
  PROCESS_INSPECTION_CREATE_SCOPE,
  PROCESS_INSPECTION_CORRECT_SCOPE,
  PROCESS_INSPECTION_REVERSE_SCOPE,
  processInspectionResultCodec,
} from './idempotency/process-inspection-idempotency.contract.js';
@Injectable()
export class ProcessInspectionService implements QualityProcessInspectionQuery {
  constructor(
    private readonly repository: ProcessInspectionRepository,
    private readonly identity: IdentityDirectoryService,
    private readonly idempotency: IdempotencyExecutor,
  ) {}
  list(query: ProcessInspectionQuery): Promise<PageResult<ProcessInspectionStepSummary>> {
    return this.repository.list({
      ...query,
      keyword: query.keyword?.trim() || undefined,
    });
  }
  async step(stepId: string): Promise<ProcessInspectionStepSummary> {
    const result = await this.repository.step(stepId);
    if (!result) throw new QualityCommandError('NOT_FOUND', '工序专检办理入口不存在');
    return result;
  }
  async entries(stepId: string, query: PageQuery): Promise<PageResult<ProcessInspectionEntry>> {
    const result = await this.repository.entries(stepId, query);
    return { ...result, items: await this.entryNames(result.items) };
  }
  async detail(id: string): Promise<ProcessInspectionEntry> {
    const result = await this.repository.detail(id);
    if (!result) throw new QualityCommandError('NOT_FOUND', '工序专检单不存在');
    return (await this.entryNames([result]))[0]!;
  }
  async listPendingForStep(
    source: ProcessInspectionSource,
    query: PageQuery,
  ): Promise<PageResult<ProcessInspectionEntry>> {
    const result = await this.repository.pendingForStep(source, query);
    return { ...result, items: await this.entryNames(result.items) };
  }
  async getForStep(
    source: ProcessInspectionSource,
    inspectionId: string,
  ): Promise<ProcessInspectionEntry | null> {
    const result = await this.repository.detailForStep(source, inspectionId);
    return result ? (await this.entryNames([result]))[0]! : null;
  }
  async records(id: string, query: PageQuery): Promise<PageResult<ProcessInspectionRecord>> {
    if (!(await this.repository.detail(id)))
      throw new QualityCommandError('NOT_FOUND', '工序专检单不存在');
    const result = await this.repository.records(id, query);
    return { ...result, items: await this.recordNames(result.items) };
  }
  private async recordNames(
    records: ProcessInspectionRecord[],
  ): Promise<ProcessInspectionRecord[]> {
    if (!records.length) return records;
    const names = new Map(
      (
        await this.identity.listUserReferencesByIds([
          ...new Set(records.map((record) => record.createdBy)),
        ])
      ).map((user) => [user.id, user.displayName]),
    );
    return records.map((record) => ({
      ...record,
      createdByName: names.get(record.createdBy) ?? '未知人员',
    }));
  }
  private async entryNames(items: ProcessInspectionEntry[]): Promise<ProcessInspectionEntry[]> {
    const records = await this.recordNames(
      items.flatMap((item) => (item.currentRecord ? [item.currentRecord] : [])),
    );
    const byId = new Map(records.map((record) => [record.id, record]));
    return items.map((item) => ({
      ...item,
      currentRecord: item.currentRecord ? byId.get(item.currentRecord.id)! : null,
    }));
  }
  async create(
    payload: CreateProcessInspectionPayload,
    context: IdempotentCommandContext,
  ): Promise<ProcessInspectionCommandResult> {
    const body = {
      batchId: payload.batchId,
      stepId: payload.stepId,
      ...normalizeProcessInspection(payload),
    };
    const { result } = await this.idempotency.execute({
      scope: PROCESS_INSPECTION_CREATE_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { body },
      resultCodec: processInspectionResultCodec,
      handler: () => this.repository.create(body, plainContext(context)),
    });
    return result;
  }
  async correct(
    id: string,
    payload: CorrectProcessInspectionPayload,
    context: IdempotentCommandContext,
  ): Promise<ProcessInspectionCommandResult> {
    const body = {
      ...normalizeProcessInspection(payload),
      version: payload.version,
      reason: requireProcessInspectionText(payload.reason, '更正原因'),
    };
    const { result } = await this.idempotency.execute({
      scope: PROCESS_INSPECTION_CORRECT_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { inspectionId: id }, body },
      resultCodec: processInspectionResultCodec,
      handler: () => this.repository.correct(id, body, plainContext(context)),
    });
    return result;
  }
  async reverse(
    id: string,
    payload: ReverseProcessInspectionPayload,
    context: IdempotentCommandContext,
  ): Promise<ProcessInspectionCommandResult> {
    const body = {
      version: payload.version,
      reason: requireProcessInspectionText(payload.reason, '冲销原因'),
    };
    const { result } = await this.idempotency.execute({
      scope: PROCESS_INSPECTION_REVERSE_SCOPE,
      key: context.idempotencyKey,
      actorId: context.actorId,
      requestId: context.requestId,
      request: { params: { inspectionId: id }, body },
      resultCodec: processInspectionResultCodec,
      handler: () => this.repository.reverse(id, body, plainContext(context)),
    });
    return result;
  }
}
function plainContext(context: IdempotentCommandContext): CommandContext {
  return {
    actorId: context.actorId,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
  };
}
