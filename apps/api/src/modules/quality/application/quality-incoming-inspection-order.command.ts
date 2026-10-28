import type {
  ChangeQualityIncomingInspectionAssociationsPayload,
  CreateQualityIncomingInspectionOrderPayload,
  CreateQualityIncomingInspectionOrderResult,
  QualityIncomingInspectionAssociationResult,
  QualityIncomingInspectionOrderItem,
  UpdateQualityIncomingInspectionOrderPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';

/** The caller first locks every involved receipt header in numeric ID order in the same pool transaction. */
export abstract class QualityIncomingInspectionOrderCommand {
  abstract create(
    payload: CreateQualityIncomingInspectionOrderPayload,
    context: CommandContext,
  ): Promise<CreateQualityIncomingInspectionOrderResult>;
  abstract changeAssociations(
    payload: ChangeQualityIncomingInspectionAssociationsPayload,
    context: CommandContext,
  ): Promise<QualityIncomingInspectionAssociationResult>;
  /** Remark changes only lock the quality order. */
  abstract updateRemark(
    id: string,
    payload: UpdateQualityIncomingInspectionOrderPayload,
    context: CommandContext,
  ): Promise<QualityIncomingInspectionOrderItem>;
}
