import { QUALITY_INBOUND_TEXT_MAX_LENGTH } from '@company/constants';
import { MAX_PERSISTED_INTEGER_QUANTITY } from '@company/utils';
import { QualityCommandError } from '../quality-command.error.js';

const invalid = (message: string): never => {
  throw new QualityCommandError('INVALID_INPUT', message);
};
export function requireQuantity(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PERSISTED_INTEGER_QUANTITY) {
    invalid(`${label}必须是 0 至 ${MAX_PERSISTED_INTEGER_QUANTITY} 的整数`);
  }
}
export function requireQualityText(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > QUALITY_INBOUND_TEXT_MAX_LENGTH
  ) {
    invalid(`${label}不能为空且最多 ${QUALITY_INBOUND_TEXT_MAX_LENGTH} 字`);
  }
  return value.trim();
}
