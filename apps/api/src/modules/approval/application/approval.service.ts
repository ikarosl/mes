import type { ApprovalSubmission } from './approval-submission.js';
import { Injectable } from '@nestjs/common';
import type {
  ApprovalCommentCommand,
  ApprovalDecisionCommand,
  ApprovalFlowDetail,
  ApprovalInstanceDetail,
  ApprovalInstanceListItem,
  ApprovalInstanceQuery,
  PublishApprovalFlowCommand,
  ApprovalRoleOption,
  ApprovalSceneItem,
  PageResult,
  SaveApprovalFlowDraft,
  UserOption,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { ApprovalDomainError } from '../domain/approval.errors.js';
import { ApprovalFlowRepository } from './ports/approval-flow.repository.js';
import { ApprovalRepository } from './ports/approval.repository.js';

@Injectable()
export class ApprovalService {
  constructor(
    private readonly repository: ApprovalRepository,
    private readonly flows: ApprovalFlowRepository,
  ) {}

  /** 返回管理页场景列表（含流程配置状态）；内存目录读取由 Registry.listSceneDefinitions 承担。 */
  listScenes(): Promise<ApprovalSceneItem[]> {
    return this.flows.listScenes();
  }

  listRoleOptions(): Promise<ApprovalRoleOption[]> {
    return this.flows.listRoleOptions();
  }

  listUserOptions(): Promise<UserOption[]> {
    return this.flows.listUserOptions();
  }

  getFlow(sceneCode: string): Promise<ApprovalFlowDetail> {
    return this.flows.getFlow(sceneCode);
  }

  saveFlowDraft(
    sceneCode: string,
    payload: SaveApprovalFlowDraft,
    audit: CommandContext,
  ): Promise<ApprovalFlowDetail> {
    return this.flows.saveFlowDraft(sceneCode, payload, audit);
  }

  publishFlow(
    sceneCode: string,
    command: PublishApprovalFlowCommand,
    audit: CommandContext,
  ): Promise<ApprovalFlowDetail> {
    return this.flows.publishFlow(sceneCode, command, audit);
  }

  listInstances(
    query: ApprovalInstanceQuery,
    actorId: string,
    canViewAll: boolean,
  ): Promise<PageResult<ApprovalInstanceListItem>> {
    if (!actorId) throw new ApprovalDomainError('FORBIDDEN', '缺少当前用户上下文');
    return this.repository.listInstances(query, actorId, canViewAll);
  }

  getInstance(id: string, actorId: string, canViewAll: boolean): Promise<ApprovalInstanceDetail> {
    if (!actorId) throw new ApprovalDomainError('FORBIDDEN', '缺少当前用户上下文');
    return this.repository.getInstance(id, actorId, canViewAll);
  }

  /** 仅供已鉴权业务入口调用；不同场景共用提交引擎，业务资格由注册的 handler 校验。 */
  submit(command: ApprovalSubmission, audit: CommandContext): Promise<ApprovalInstanceDetail> {
    if (!audit.actorId) throw new ApprovalDomainError('FORBIDDEN', '缺少当前用户上下文');
    if (
      !Number.isInteger(command.expectedVersion) ||
      command.expectedVersion < 0 ||
      command.expectedVersion > 2_147_483_647
    ) {
      throw new ApprovalDomainError('INVALID_INPUT', '请提供有效的业务对象版本');
    }
    return this.repository.submit(command, audit);
  }

  approve(id: string, command: ApprovalDecisionCommand, audit: CommandContext) {
    return this.repository.approve(id, command, audit);
  }

  reject(id: string, command: ApprovalDecisionCommand, audit: CommandContext) {
    return this.repository.reject(id, command, audit);
  }

  withdraw(id: string, command: ApprovalCommentCommand, audit: CommandContext) {
    return this.repository.withdraw(id, command, audit);
  }
}
