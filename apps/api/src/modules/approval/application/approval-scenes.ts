import type { ApprovalSubjectType } from '@company/contracts';

export interface ApprovalSceneDefinition {
  readonly code: string;
  readonly module: string;
  readonly name: string;
  readonly description: string;
  readonly subjectType: ApprovalSubjectType;
}
