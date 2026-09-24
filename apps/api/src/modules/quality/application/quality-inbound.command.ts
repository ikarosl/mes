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
  roundId: string;
  caseType: QualityInboundCaseType;
  /** 来源轮次的申报快照，不是质检现场核实的整批数量。 */
  coveredQuantity: number;
  reason: string;
}
export interface CompleteQualityInboundCaseInput extends QualityInboundInspectionInput {
  previousRecordId?: string | null;
  caseId: string;
  version: number;
  receiptLineId: string;
  receiptRevisionId: string;
  roundId: string;
}

/** 调用方先锁定到货与当前处理轮次；全部命令只接受同池活动事务。 */
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
    input: { receiptLineId: string; roundId: string; supersededByRoundId: string; reason: string },
    context: CommandContext,
  ): Promise<void>;
}
