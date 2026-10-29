import { Decimal } from 'decimal.js';
import {
  PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH,
  PURCHASE_ORDER_DEFAULT_TAX_RATE_PERCENT,
  PURCHASE_ORDER_MAX_QUANTITY,
  PURCHASE_ORDER_TAX_RATE_MAX_DECIMAL_PLACES,
  PURCHASE_ORDER_TOTAL_AMOUNT_DECIMAL_PLACES,
  PURCHASE_ORDER_TOTAL_AMOUNT_MAX_LENGTH,
} from '@company/constants';
import type { PurchaseOrderTotalAmountSource } from '@company/contracts';

export interface PurchaseLineAmountInput {
  plannedQuantity: number | string;
  taxExclusiveAmount?: string | null;
  /** Independently recorded quotation; validated and preserved, never used in total calculation. */
  taxInclusiveAmount?: string | null;
  taxRatePercent?: string | null;
  manualTotalAmount?: string | null;
}

export interface PurchaseLineAmountResult {
  taxExclusiveAmount: string | null;
  taxInclusiveAmount: string | null;
  taxRatePercent: string;
  manualTotalAmount: string | null;
  calculatedTotalAmount: string | null;
  totalAmount: string | null;
  totalAmountSource: PurchaseOrderTotalAmountSource | null;
}

// Cover every permitted unit-price digit, the quantity and the percentage factor before rounding.
// A private constructor prevents another consumer's Decimal configuration from changing this rule.
const MoneyDecimal = Decimal.clone({
  precision:
    PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH +
    String(PURCHASE_ORDER_MAX_QUANTITY).length +
    PURCHASE_ORDER_TAX_RATE_MAX_DECIMAL_PLACES +
    16,
  rounding: Decimal.ROUND_HALF_UP,
});

function decimalText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new RangeError(`${label}须使用十进制字符串`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) throw new RangeError(`${label}最多 ${maxLength} 个字符`);
  if (!/^\d+(?:\.\d+)?$/.test(text))
    throw new RangeError(`${label}须为非负十进制数，不支持说明文字或科学计数法`);
  return text;
}

function assertFractionLength(text: string, places: number, label: string): void {
  const fraction = text.split('.')[1];
  if (fraction && fraction.length > places) throw new RangeError(`${label}最多 ${places} 位小数`);
}

function quantityText(value: number | string): string {
  const text = typeof value === 'string' ? value.trim() : String(value);
  if (!/^\d+$/.test(text)) throw new RangeError('采购数量须为正整数');
  const quantity = Number(text);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > PURCHASE_ORDER_MAX_QUANTITY)
    throw new RangeError(`采购数量须为 1～${PURCHASE_ORDER_MAX_QUANTITY} 的整数`);
  return String(quantity);
}

function totalText(value: Decimal): string {
  const result = value.toFixed(PURCHASE_ORDER_TOTAL_AMOUNT_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
  if (result.length > PURCHASE_ORDER_TOTAL_AMOUNT_MAX_LENGTH)
    throw new RangeError(`含税总金额最多 ${PURCHASE_ORDER_TOTAL_AMOUNT_MAX_LENGTH} 个字符`);
  return result;
}

/** Shared procurement price normalization and final total; never uses binary floating-point money. */
export function calculatePurchaseLineAmount(
  input: PurchaseLineAmountInput,
): PurchaseLineAmountResult {
  const quantity = quantityText(input.plannedQuantity);
  const taxExclusiveAmount = decimalText(
    input.taxExclusiveAmount,
    '无税单价',
    PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH,
  );
  const taxInclusiveAmount = decimalText(
    input.taxInclusiveAmount,
    '含税单价',
    PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH,
  );
  const rateText =
    decimalText(input.taxRatePercent, '税率', PURCHASE_ORDER_AMOUNT_TEXT_MAX_LENGTH) ??
    PURCHASE_ORDER_DEFAULT_TAX_RATE_PERCENT;
  assertFractionLength(rateText, PURCHASE_ORDER_TAX_RATE_MAX_DECIMAL_PLACES, '税率');
  const rate = new MoneyDecimal(rateText);
  if (rate.gt('100')) throw new RangeError('税率须在 0%～100% 之间');
  const taxRatePercent = rate.toFixed();

  const manualText = decimalText(
    input.manualTotalAmount,
    '手填总金额',
    PURCHASE_ORDER_TOTAL_AMOUNT_MAX_LENGTH,
  );
  let manualTotalAmount: string | null = null;
  if (manualText !== null) {
    assertFractionLength(manualText, PURCHASE_ORDER_TOTAL_AMOUNT_DECIMAL_PLACES, '手填总金额');
    manualTotalAmount = totalText(new MoneyDecimal(manualText));
  }

  let calculatedTotalAmount: string | null = null;
  if (taxExclusiveAmount !== null) {
    calculatedTotalAmount = totalText(
      new MoneyDecimal(taxExclusiveAmount).times(quantity).times(rate.div('100').plus('1')),
    );
  }

  // Explicit zero is a manual value. Absence is the only signal to use the calculated result.
  let totalAmountSource: PurchaseOrderTotalAmountSource | null = null;
  const totalAmount = manualTotalAmount ?? calculatedTotalAmount;
  if (manualTotalAmount !== null) totalAmountSource = 'manual';
  else if (calculatedTotalAmount !== null) totalAmountSource = 'calculated';
  return {
    taxExclusiveAmount,
    taxInclusiveAmount,
    taxRatePercent,
    manualTotalAmount,
    calculatedTotalAmount,
    totalAmount,
    totalAmountSource,
  };
}
