import type { GenerateBatchNoInput } from './batch-no.types.js';

/** 只负责生成批次编码；持久化唯一性由调用方负责。 */
export const generateBatchNo = ({ prefix, sequence, padding }: GenerateBatchNoInput): string => {
  const normalizedPrefix = prefix.trim();
  if (!normalizedPrefix) throw new Error('批次号前缀不能为空');
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('批次号序号必须是正整数');
  if (!Number.isSafeInteger(padding) || padding < 1) throw new Error('批次号补零位数必须是正整数');
  return `${normalizedPrefix}-${String(sequence).padStart(padding, '0')}`;
};
