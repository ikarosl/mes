import type {
  ProductionOutputInspectionFacts,
  RecordFinishedInspectionPayload,
} from '@company/contracts';
import { normalizeInspectionQuantities } from './inspection-quantity.policy.js';
import { QualityCommandError } from '../quality-command.error.js';

export function normalizeFinishedInspectionFacts(
  input: Pick<
    RecordFinishedInspectionPayload,
    'inspectionMethod' | 'qualifiedQuantity' | 'unqualifiedQuantity' | 'releaseDecision'
  >,
): ProductionOutputInspectionFacts {
  const normalized = normalizeInspectionQuantities(input);
  return {
    inspectionMethod: normalized.inspectionMethod,
    inspectedQuantity: normalized.inspectedQuantity,
    qualifiedQuantity: normalized.qualifiedQuantity,
    unqualifiedQuantity: normalized.unqualifiedQuantity,
    releaseDecision: normalized.releaseDecision,
  };
}

export function evaluateOutputInspection(facts: ProductionOutputInspectionFacts): void {
  const normalized = normalizeInspectionQuantities(facts);
  if (normalized.inspectedQuantity !== facts.inspectedQuantity)
    throw new QualityCommandError('INVALID_INPUT', '实际检查数必须等于合格数加不合格数');
}
