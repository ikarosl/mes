import type { QualityInboundInspectionInput, QualityReleaseDecision } from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';
import { toBeijingISOString } from '@company/utils';
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
  remark: '',
  evidence: '',
});
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
): QualityInboundInspectionInput | null {
  const quantities = inboundInspectionPreview(input);
  if (
    !quantities ||
    !input.releaseDecision ||
    !input.remark.trim() ||
    !input.evidence.trim() ||
    !input.inspectedAt ||
    !toBeijingDateTimeInputValue(input.inspectedAt)
  )
    return null;
  return {
    ...input,
    qualifiedQuantity: quantities.qualifiedQuantity,
    unqualifiedQuantity: quantities.unqualifiedQuantity,
    releaseDecision: input.releaseDecision,
    inspectedAt: toBeijingISOString(input.inspectedAt),
  };
}
