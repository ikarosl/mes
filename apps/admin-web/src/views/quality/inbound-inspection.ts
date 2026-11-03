import type {
  BusinessTemplateItem,
  JsonTableData,
  QualityInboundInspectionInput,
  QualityReleaseDecision,
} from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { toBeijingISOString, validateTemplateTableInput } from '@company/utils';
import { toBeijingDateTimeInputValue } from '../../utils/date';

export type InboundInspectionDraft = Omit<
  QualityInboundInspectionInput,
  'qualifiedQuantity' | 'unqualifiedQuantity' | 'releaseDecision'
> & {
  qualifiedQuantity: number | undefined;
  unqualifiedQuantity: number | undefined;
  releaseDecision: QualityReleaseDecision | undefined;
};
export const initialInboundInspection = (): InboundInspectionDraft => ({
  inspectionMethod: 'full',
  qualifiedQuantity: undefined,
  unqualifiedQuantity: undefined,
  releaseDecision: undefined,
  inspectedAt: toBeijingISOString(Date.now()),
  evidence: '',
  inspectionDetails: { columns: [], rows: [] },
  inspectionTemplateId: '',
  inspectionTemplateVersion: 0,
});
export function normalizeInboundInspectionDetails(
  value: JsonTableData,
  template: BusinessTemplateItem,
): JsonTableData {
  return validateTemplateTableInput(template.content, template.columnRules, value);
}
export function inboundInspectionPreview(input: InboundInspectionDraft) {
  const good = input.qualifiedQuantity;
  const bad = input.unqualifiedQuantity;
  if (
    good === undefined ||
    bad === undefined ||
    !Number.isSafeInteger(good) ||
    !Number.isSafeInteger(bad) ||
    good < 0 ||
    bad < 0 ||
    good + bad <= 0 ||
    good + bad > PURCHASE_ORDER_MAX_QUANTITY
  )
    return null;
  return { qualifiedQuantity: good, unqualifiedQuantity: bad, inspectedQuantity: good + bad };
}
export function inboundInspectionInput(
  input: InboundInspectionDraft,
  template: BusinessTemplateItem | null = null,
): QualityInboundInspectionInput | null {
  const quantities = inboundInspectionPreview(input);
  if (
    !template ||
    input.inspectionTemplateId !== template.id ||
    input.inspectionTemplateVersion !== template.version ||
    !quantities ||
    !input.releaseDecision ||
    !input.evidence.trim() ||
    !input.inspectedAt ||
    !toBeijingDateTimeInputValue(input.inspectedAt)
  )
    return null;
  let inspectionDetails: JsonTableData;
  try {
    inspectionDetails = normalizeInboundInspectionDetails(input.inspectionDetails, template);
  } catch {
    // 固定内容和必填输入同样由共享规则校验，未完成时阻止提交。
    return null;
  }
  return {
    ...input,
    qualifiedQuantity: quantities.qualifiedQuantity,
    unqualifiedQuantity: quantities.unqualifiedQuantity,
    releaseDecision: input.releaseDecision,
    inspectedAt: toBeijingISOString(input.inspectedAt),
    inspectionDetails,
  };
}
