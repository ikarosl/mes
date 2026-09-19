import type {
  QualityInboundCaseItem,
  QualityInboundCaseType,
  QualityInboundInspectionInput,
  QualityInboundInspectionItem,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';

export interface StartQualityInboundCaseInput {
  receiptLineId: string;
  receiptRevisionId: string;
  sourceScopeId: string | null;
  targetScopeId: string | null;
  caseType: QualityInboundCaseType;
  coveredQuantity: number;
  reason: string;
}
export interface CompleteQualityInboundCaseInput extends QualityInboundInspectionInput {
  caseId: string;
  version: number;
  receiptLineId: string;
  receiptRevisionId: string;
  targetScopeId: string | null;
}

/** 调用方先锁定到货与范围；全部命令只接受同池活动事务。 */
export abstract class QualityInboundCommand {
  abstract startCase(
    input: StartQualityInboundCaseInput,
    context: CommandContext,
  ): Promise<QualityInboundCaseItem>;
  abstract completeCase(
    input: CompleteQualityInboundCaseInput,
    context: CommandContext,
  ): Promise<QualityInboundInspectionItem>;
  abstract supersedeCases(
    input: { caseIds: string[]; receiptLineId: string; receiptRevisionId: string },
    context: CommandContext,
  ): Promise<void>;
}
