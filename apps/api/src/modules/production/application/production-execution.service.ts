import { Injectable } from '@nestjs/common';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { IdentityDirectoryService } from '../../identity/public.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { ProductionExecutionRepository } from './ports/production-execution.repository.js';

@Injectable()
export class ProductionExecutionService {
  constructor(
    private readonly execution: ProductionExecutionRepository,
    private readonly identity: IdentityDirectoryService,
  ) {}

  getCompletionCheck(batchId: string) {
    return this.execution.getCompletionCheck(batchId);
  }

  completeExecution(batchId: string, version: number, context: CommandContext) {
    if (!context.actorId) throw new ProductionDomainError('INVALID_INPUT', '缺少当前操作人身份');
    return this.execution.completeExecution(batchId, version, context);
  }

  listMyTasks(context: CommandContext) {
    if (!context.actorId) throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '缺少当前员工身份');
    return this.execution.listWorkerTasks(context.actorId);
  }

  async assignStep(
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string,
    version: number,
    context: CommandContext,
  ) {
    await this.requireActiveUser(responsibleUserId);
    return this.execution.assignStep(batchId, stepRecordId, responsibleUserId, version, context);
  }

  unassignStep(batchId: string, stepRecordId: string, version: number, context: CommandContext) {
    return this.execution.unassignStep(batchId, stepRecordId, version, context);
  }

  async reassignStep(
    batchId: string,
    stepRecordId: string,
    responsibleUserId: string,
    version: number,
    context: CommandContext,
  ) {
    await this.requireActiveUser(responsibleUserId);
    return this.execution.reassignStep(batchId, stepRecordId, responsibleUserId, version, context);
  }

  startStep(batchId: string, stepRecordId: string, version: number, context: CommandContext) {
    if (!context.actorId) throw new ProductionDomainError('NOT_STEP_ASSIGNEE', '缺少当前员工身份');
    return this.execution.startStep(batchId, stepRecordId, version, {
      ...context,
      actorId: context.actorId,
    });
  }

  private async requireActiveUser(userId: string): Promise<void> {
    const users = await this.identity.listActiveUserOptionsByIds([userId]);
    if (users.length !== 1)
      throw new ProductionDomainError('INVALID_INPUT', '派工员工不存在或已停用');
  }
}
