import type { GenerateBatchNoInput } from './batch-no.types.js';

/** Generates a batch code only; persistence uniqueness belongs to the caller. */
export const generateBatchNo = ({ prefix, sequence, padding }: GenerateBatchNoInput): string => {
  const normalizedPrefix = prefix.trim();
  if (!normalizedPrefix) throw new Error('批次号前缀不能为空');
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('批次号序号必须是正整数');
  if (!Number.isSafeInteger(padding) || padding < 1) throw new Error('批次号补零位数必须是正整数');
  return `${normalizedPrefix}-${String(sequence).padStart(padding, '0')}`;
};
