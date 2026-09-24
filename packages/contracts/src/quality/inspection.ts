export type QualityInspectionMethod = 'full' | 'sampling' | 'zero_confirmation';
export type QualityReleaseDecision = 'released' | 'pending_reinspection' | 'not_released';
export type QualityInspectionSourceKind = 'incoming' | 'finished';

/** Finished-inspection measured facts; incoming uses its own G/F-only contract. */
export interface QualityInspectionQuantityInput {
  inspectionMethod: QualityInspectionMethod;
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  coveredQuantity?: number;
  releaseDecision: QualityReleaseDecision;
}

export interface QualityInspectionQuantities extends QualityInspectionQuantityInput {
  coveredQuantity: number;
  inspectedQuantity: number;
  /** Field name retained; derived finished-output suggestion, not a finalization or inbound limit. */
  releasedQuantity: number;
}
