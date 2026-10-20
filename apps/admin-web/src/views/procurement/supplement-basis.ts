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
    selectedExcess: choice.selectedExcess
      ? {
          ...choice.selectedExcess,
          receiptLinkedSupplements: choice.selectedExcess.receiptLinkedSupplements.map((entry) => ({
            ...entry,
          })),
        }
      : null,
    selectedQuality: choice.selectedQuality
      ? {
          ...choice.selectedQuality,
          receiptLinkedSupplements: choice.selectedQuality.receiptLinkedSupplements.map(
            (entry) => ({
              ...entry,
            }),
          ),
        }
      : null,
  };
}

/** 相关补单只供查看，不参与当前到货或退回依据的变更判断。 */
export function supplementBasisSignature(
  basis: PurchaseExcessReceiptCandidate | PurchaseQualityReplacementCandidate,
): string {
  return JSON.stringify(basis, (key: string, value: unknown) =>
    key === 'receiptLinkedSupplements' ? undefined : value,
  );
}
