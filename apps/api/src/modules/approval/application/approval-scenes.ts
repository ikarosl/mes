import type { ApprovalSubjectType } from '@company/contracts';

export interface ApprovalBusinessAssigneeSource {
  readonly code: string;
  readonly name: string;
  readonly description: string;
}

export interface ApprovalSceneDefinition {
  readonly code: string;
  readonly module: string;
  readonly name: string;
  readonly description: string;
  readonly subjectType: ApprovalSubjectType;
  readonly businessAssigneeSources: readonly ApprovalBusinessAssigneeSource[];
  readonly requiredFinalAssigneeSourceCode: string | null;
}
