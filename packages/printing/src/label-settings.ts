import { LodopPrintError } from './print-error.js';

export interface LabelPrintSettings {
  printerName: string;
  widthMm: number;
  heightMm: number;
  copies: number;
}

export interface BarcodeLabel {
  barcode: string;
  text: string;
}

export const LABEL_PRINT_LIMITS = Object.freeze({
  minDimensionMm: 10,
  maxDimensionMm: 300,
  minCopies: 1,
  maxCopies: 100,
});

export const DEFAULT_LABEL_PRINT_SETTINGS: Readonly<LabelPrintSettings> = Object.freeze({
  printerName: '',
  widthMm: 60,
  heightMm: 40,
  copies: 1,
});

export function checkLabelSize(paper: Pick<LabelPrintSettings, 'widthMm' | 'heightMm'>): void {
  const { minDimensionMm, maxDimensionMm } = LABEL_PRINT_LIMITS;
  for (const dimension of [paper?.widthMm, paper?.heightMm]) {
    if (!Number.isFinite(dimension) || dimension < minDimensionMm || dimension > maxDimensionMm) {
      throw new LodopPrintError(
        'INVALID_SETTINGS',
        `标签宽度和高度须为 ${minDimensionMm} 至 ${maxDimensionMm} 毫米`,
      );
    }
  }
}

export function checkBarcodeLabel(label: BarcodeLabel): void {
  if (typeof label?.barcode !== 'string' || !/^[\x20-\x7e]{1,128}$/.test(label.barcode)) {
    throw new LodopPrintError('INVALID_LABELS', '条码须为非空可打印 ASCII 文本，且不超过 128 字符');
  }
  if (
    typeof label.text !== 'string' ||
    !label.text.trim() ||
    label.text.length > 200 ||
    /[\p{Cc}\p{Zl}\p{Zp}]/u.test(label.text)
  ) {
    throw new LodopPrintError('INVALID_LABELS', '标签文字须为非空单行文本，且不超过 200 字符');
  }
}
