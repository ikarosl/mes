import type {
  ProductionOutputInspectionFacts,
  RecordFinishedInspectionPayload,
} from '@company/contracts';
import { normalizeInspectionQuantities } from './inspection-quantity.policy.js';

export function normalizeFinishedInspectionFacts(
  input: Pick<
    RecordFinishedInspectionPayload,
    | 'inspectionMethod'
    | 'qualifiedQuantity'
    | 'unqualifiedQuantity'
    | 'coveredQuantity'
    | 'releaseDecision'
  >,
): ProductionOutputInspectionFacts {
  const normalized = normalizeInspectionQuantities(input);
  return {
    inspectionMethod: normalized.inspectionMethod,
    coveredQuantity: normalized.coveredQuantity,
    inspectedQuantity: normalized.inspectedQuantity,
    unqualifiedQuantity: normalized.unqualifiedQuantity,
    releaseDecision: normalized.releaseDecision,
  };
}

export function evaluateOutputInspection(facts: ProductionOutputInspectionFacts): {
  qualifiedQuantity: number;
  releasedQuantity: number;
} {
  const result = normalizeInspectionQuantities({
    ...facts,
    qualifiedQuantity: facts.inspectedQuantity - facts.unqualifiedQuantity,
  });
  return { qualifiedQuantity: result.qualifiedQuantity, releasedQuantity: result.releasedQuantity };
}
