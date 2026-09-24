import type { QualityInboundInspectionInput, QualityReleaseDecision } from '@company/contracts';
import { PURCHASE_ORDER_MAX_QUANTITY } from '@company/constants';

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
  inspectedAt: new Date().toISOString(),
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
    !Number.isFinite(new Date(input.inspectedAt).getTime())
  )
    return null;
  return {
    ...input,
    qualifiedQuantity: quantities.qualifiedQuantity,
    unqualifiedQuantity: quantities.unqualifiedQuantity,
    releaseDecision: input.releaseDecision,
  };
}
