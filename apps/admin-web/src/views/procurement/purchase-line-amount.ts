import { calculatePurchaseLineAmount } from '@company/utils';

export interface PurchaseLineAmountDraft {
  plannedQuantity: number | string | undefined;
  taxExclusiveAmount: string;
  taxInclusiveAmount: string;
  taxRatePercent: string;
  manualTotalAmount: string;
}

interface PurchaseLineAmountPreview {
  amount: ReturnType<typeof calculatePurchaseLineAmount> | null;
  error: string | null;
}

/** 数量尚未填写时保留草稿；其余金额口径与校验全部由共享函数负责。 */
export function previewPurchaseLineAmount(
  input: PurchaseLineAmountDraft,
): PurchaseLineAmountPreview {
  if (input.plannedQuantity === undefined) return { amount: null, error: null };
  try {
    return {
      amount: calculatePurchaseLineAmount({ ...input, plannedQuantity: input.plannedQuantity }),
      error: null,
    };
  } catch (error) {
    if (error instanceof RangeError) return { amount: null, error: error.message };
    throw error;
  }
}
