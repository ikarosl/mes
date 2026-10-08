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
  'version' | 'qualifiedQuantity' | 'unqualifiedQuantity' | 'releaseDecision'
> & {
  qualifiedQuantity: number | undefined;
  unqualifiedQuantity: number | undefined;
  releaseDecision: RecordFinishedInspectionPayload['releaseDecision'] | undefined;
  /** 零产出由检验人员明确核实，不能仅因切换方式自动确认。 */
  zeroConfirmed: boolean;
};

interface InspectionQuantities {
  inspectedQuantity: number;
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
}

/** 历史事实已由服务端派生，读取时核对数量关系。 */
export function inspectionQuantities(
  facts: ProductionOutputInspectionFacts,
): InspectionQuantities | null {
  const {
    inspectedQuantity: inspected,
    qualifiedQuantity: qualified,
    unqualifiedQuantity: failed,
    inspectionMethod: method,
    releaseDecision: decision,
  } = facts;
  if (
    !PRODUCTION_OUTPUT_INSPECTION_METHODS.includes(method) ||
    !PRODUCTION_OUTPUT_RELEASE_DECISIONS.includes(decision) ||
    [qualified, inspected, failed].some(
      (quantity) =>
        !Number.isSafeInteger(quantity) ||
        quantity < 0 ||
        quantity > PRODUCTION_OUTPUT_QUANTITY_MAX,
    ) ||
    qualified + failed !== inspected
  )
    return null;
  if (method === 'zero_confirmation') {
    if (qualified !== 0 || inspected !== 0 || failed !== 0 || decision !== 'released') return null;
  } else if (inspected === 0) return null;
  return {
    inspectedQuantity: inspected,
    qualifiedQuantity: qualified,
    unqualifiedQuantity: failed,
  };
}

/** 全检与抽检只填写合格、不合格；检查数由两者之和派生。 */
export function inspectionFormQuantities(
  form: Pick<
    ProductionOutputInspectionForm,
    'inspectionMethod' | 'qualifiedQuantity' | 'unqualifiedQuantity'
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
  return inspectionQuantities({
    inspectionMethod: form.inspectionMethod,
    inspectedQuantity,
    qualifiedQuantity: form.qualifiedQuantity,
    unqualifiedQuantity: form.unqualifiedQuantity,
    // 数量校验与处理结论独立；普通检验仍须另行人工选择结论。
    releaseDecision: 'released',
  });
}
