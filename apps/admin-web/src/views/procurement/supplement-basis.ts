import type {
  PurchaseExcessReceiptCandidate,
  PurchaseOrderLine,
  PurchaseOrderSupplementReason,
  PurchaseQualityReplacementCandidate,
} from '@company/contracts';

export interface SupplementBasisChoice {
  line: PurchaseOrderLine;
  selectedExcess: PurchaseExcessReceiptCandidate | null;
  selectedQuality: PurchaseQualityReplacementCandidate | null;
}

export interface SupplementBasisConfirmation {
  orderId: string;
  reason: PurchaseOrderSupplementReason;
  replacingLineId?: string;
  choices: SupplementBasisChoice[];
}

/** 选择窗只修改临时对象，取消或翻页不能改动主窗草稿的依据。 */
export function copySupplementBasis(choice: SupplementBasisChoice): SupplementBasisChoice {
  return {
    line: choice.line,
    selectedExcess: choice.selectedExcess ? { ...choice.selectedExcess } : null,
    selectedQuality: choice.selectedQuality
      ? {
          ...choice.selectedQuality,
          linkedSupplements: choice.selectedQuality.linkedSupplements.map((entry) => ({
            ...entry,
          })),
        }
      : null,
  };
}
