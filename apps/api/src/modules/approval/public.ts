export { ApprovalModule } from './approval.module.js';
export { ApprovalService } from './application/approval.service.js';
export { ApprovalSubjectHandlerRegistry } from './application/approval-subject-handler.registry.js';
export type {
  ApprovalSubjectHandler,
  ApprovalSubjectPreparation,
  ApprovalBusinessAssigneeResolution,
} from './application/approval-subject-handler.js';

export type {
  ApprovalSceneDefinition,
  ApprovalBusinessAssigneeSource,
} from './application/approval-scenes.js';
export { ApprovalSubjectError } from './application/approval-subject-handler.js';

export type { ApprovalSubmission } from './application/approval-submission.js';
export { ApprovalDomainExceptionFilter } from './presentation/http/approval-domain-exception.filter.js';
