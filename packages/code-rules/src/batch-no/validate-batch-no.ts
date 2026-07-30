import type { BatchNoRule } from './batch-no.types.js';

/** Validates a manually entered batch code against one explicit, pure formatting rule. */
export const isBatchNoValid = (value: string, { prefix, padding }: BatchNoRule): boolean => {
  const normalizedPrefix = prefix.trim();
  if (!normalizedPrefix || !Number.isSafeInteger(padding) || padding < 1) return false;
  return new RegExp(`^${escapeRegExp(normalizedPrefix)}-\\d{${padding},}$`).test(value.trim());
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
