import type { BatchNoRule } from './batch-no.types.js';

/** 根据明确且纯粹的格式规则校验手工输入的批次编码。 */
export const isBatchNoValid = (value: string, { prefix, padding }: BatchNoRule): boolean => {
  const normalizedPrefix = prefix.trim();
  if (!normalizedPrefix || !Number.isSafeInteger(padding) || padding < 1) return false;
  return new RegExp(`^${escapeRegExp(normalizedPrefix)}-\\d{${padding},}$`).test(value.trim());
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
