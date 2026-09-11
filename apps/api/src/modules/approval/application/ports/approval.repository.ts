import type {
  ApprovalCommentCommand,
  ApprovalDecisionCommand,
  ApprovalInstanceDetail,
  ApprovalInstanceListItem,
  ApprovalInstanceQuery,
  PageResult,
} from '@company/contracts';
import type { ApprovalSubmission } from '../approval-submission.js';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ApprovalRepository {
  abstract listInstances(
    query: ApprovalInstanceQuery,
    actorId: string,
    canViewAll: boolean,
  ): Promise<PageResult<ApprovalInstanceListItem>>;
  abstract getInstance(
    id: string,
    actorId: string,
    canViewAll: boolean,
    canReassign?: boolean,
  ): Promise<ApprovalInstanceDetail>;
  abstract submit(
    command: ApprovalSubmission,
    audit: CommandContext,
  ): Promise<ApprovalInstanceDetail>;
  abstract approve(
    id: string,
    command: ApprovalDecisionCommand,
    audit: CommandContext,
  ): Promise<ApprovalInstanceDetail>;
  abstract reject(
    id: string,
    command: ApprovalDecisionCommand,
    audit: CommandContext,
  ): Promise<ApprovalInstanceDetail>;
  abstract withdraw(
    id: string,
    command: ApprovalCommentCommand,
    audit: CommandContext,
  ): Promise<ApprovalInstanceDetail>;
  abstract reassign(
    id: string,
    command: ApprovalCommentCommand,
    audit: CommandContext,
  ): Promise<ApprovalInstanceDetail>;
}
