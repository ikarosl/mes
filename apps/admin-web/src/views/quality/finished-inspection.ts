import {
  PRODUCTION_OUTPUT_INSPECTION_METHODS,
  PRODUCTION_OUTPUT_QUANTITY_MAX,
  PRODUCTION_OUTPUT_RELEASE_DECISIONS,
} from '@company/constants';
import type {
  ProductionOutputInspectionFacts,
  RecordFinishedInspectionPayload,
} from '@company/contracts';

export type ProductionOutputInspectionForm = Omit<
  RecordFinishedInspectionPayload,
  'version' | 'coveredQuantity' | 'qualifiedQuantity' | 'unqualifiedQuantity'
> & {
  coveredQuantity: number | undefined;
  qualifiedQuantity: number | undefined;
  unqualifiedQuantity: number | undefined;
};

interface InspectionQuantities {
  coveredQuantity: number;
  inspectedQuantity: number;
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  releasedQuantity: number;
}

/** 历史事实已由服务端派生，读取时核对数量关系。 */
export function inspectionQuantities(
  facts: ProductionOutputInspectionFacts,
): InspectionQuantities | null {
  const {
    coveredQuantity: covered,
    inspectedQuantity: inspected,
    unqualifiedQuantity: failed,
    inspectionMethod: method,
    releaseDecision: decision,
  } = facts;
  if (
    !PRODUCTION_OUTPUT_INSPECTION_METHODS.includes(method) ||
    !PRODUCTION_OUTPUT_RELEASE_DECISIONS.includes(decision) ||
    [covered, inspected, failed].some(
      (quantity) =>
        !Number.isSafeInteger(quantity) ||
        quantity < 0 ||
        quantity > PRODUCTION_OUTPUT_QUANTITY_MAX,
    ) ||
    inspected > covered ||
    failed > inspected
  )
    return null;
  if (method === 'zero_confirmation') {
    if (covered !== 0 || inspected !== 0 || failed !== 0 || decision !== 'released') return null;
  } else if (covered === 0 || inspected === 0 || (method === 'full' && inspected !== covered))
    return null;
  return {
    coveredQuantity: covered,
    inspectedQuantity: inspected,
    qualifiedQuantity: inspected - failed,
    unqualifiedQuantity: failed,
    releasedQuantity: decision === 'released' ? covered - failed : 0,
  };
}

/** 表单只填写合格/不合格；抽检另外核实整批实物总数。 */
export function inspectionFormQuantities(
  form: Pick<
    ProductionOutputInspectionForm,
    | 'inspectionMethod'
    | 'qualifiedQuantity'
    | 'unqualifiedQuantity'
    | 'coveredQuantity'
    | 'releaseDecision'
  >,
): InspectionQuantities | null {
  if (form.qualifiedQuantity === undefined || form.unqualifiedQuantity === undefined) return null;
  if (
    [form.qualifiedQuantity, form.unqualifiedQuantity].some(
      (quantity) =>
        !Number.isSafeInteger(quantity) ||
        quantity < 0 ||
        quantity > PRODUCTION_OUTPUT_QUANTITY_MAX,
    )
  )
    return null;
  const inspectedQuantity = form.qualifiedQuantity + form.unqualifiedQuantity;
  const coveredQuantity =
    form.inspectionMethod === 'sampling' ? form.coveredQuantity : inspectedQuantity;
  if (coveredQuantity === undefined) return null;
  return inspectionQuantities({
    inspectionMethod: form.inspectionMethod,
    coveredQuantity,
    inspectedQuantity,
    unqualifiedQuantity: form.unqualifiedQuantity,
    releaseDecision: form.releaseDecision,
  });
}
