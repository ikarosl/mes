import type {
  ApprovalCommentCommand,
  ApprovalDecisionCommand,
  ApprovalInstanceDetail,
  ApprovalInstanceListItem,
  ApprovalInstanceQuery,
  ApprovalSubmissionResult,
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
  ): Promise<ApprovalInstanceDetail>;
  abstract submit(
    command: ApprovalSubmission,
    audit: CommandContext,
  ): Promise<ApprovalSubmissionResult>;
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
}
