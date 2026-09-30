export interface ReceiptInspectionExecutionFacts {
  inboundQuantity: number;
  qualityReturnedQuantity: number;
  otherReturnedQuantity: number;
}

export interface ReceiptInspectionAllocationFact {
  inspectionId: string | null;
  inboundQuantity: number;
  returnedQuantity: number;
  returnReason: string | null;
}

/** Only actual execution attributed to the referenced inspection affects its remaining suggestion. */
export function summarizeReceiptInspectionExecution(
  allocations: readonly ReceiptInspectionAllocationFact[],
  inspectionId: string | null,
): ReceiptInspectionExecutionFacts {
  const execution: ReceiptInspectionExecutionFacts = {
    inboundQuantity: 0,
    qualityReturnedQuantity: 0,
    otherReturnedQuantity: 0,
  };
  if (inspectionId === null) return execution;
  for (const allocation of allocations) {
    if (allocation.inspectionId !== inspectionId) continue;
    execution.inboundQuantity += allocation.inboundQuantity;
    if (allocation.returnReason === 'quality')
      execution.qualityReturnedQuantity += allocation.returnedQuantity;
    else execution.otherReturnedQuantity += allocation.returnedQuantity;
  }
  return execution;
}

export function suggestedReceiptInboundQuantity(
  inspection: {
    method: 'full' | 'sampling';
    qualifiedQuantity: number;
    unqualifiedQuantity: number;
  },
  confirmedQuantity: number,
  execution: ReceiptInspectionExecutionFacts,
): number | null {
  const inspected = inspection.qualifiedQuantity + inspection.unqualifiedQuantity;
  if (inspection.method === 'full')
    return Math.max(
      0,
      inspected -
        execution.inboundQuantity -
        execution.otherReturnedQuantity -
        Math.max(execution.qualityReturnedQuantity, inspection.unqualifiedQuantity),
    );
  return inspected <= confirmedQuantity && inspection.unqualifiedQuantity <= confirmedQuantity
    ? confirmedQuantity - inspection.unqualifiedQuantity
    : null;
}
