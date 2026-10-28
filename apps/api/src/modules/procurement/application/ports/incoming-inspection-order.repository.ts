import type {
  ChangeQualityIncomingInspectionAssociationsPayload,
  CreateQualityIncomingInspectionOrderPayload,
  CreateQualityIncomingInspectionOrderResult,
  QualityIncomingInspectionAssociationResult,
  QualityIncomingInspectionOrderItem,
  UpdateQualityIncomingInspectionOrderPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class IncomingInspectionOrderRepository {
  abstract create(
    payload: CreateQualityIncomingInspectionOrderPayload,
    context: CommandContext,
  ): Promise<CreateQualityIncomingInspectionOrderResult>;
  abstract changeAssociations(
    payload: ChangeQualityIncomingInspectionAssociationsPayload,
    context: CommandContext,
  ): Promise<QualityIncomingInspectionAssociationResult>;
  abstract updateRemark(
    id: string,
    payload: UpdateQualityIncomingInspectionOrderPayload,
    context: CommandContext,
  ): Promise<QualityIncomingInspectionOrderItem>;
}
