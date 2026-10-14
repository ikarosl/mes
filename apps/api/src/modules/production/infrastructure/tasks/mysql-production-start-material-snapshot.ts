import type { ProductionExecutionStartMaterialSnapshot } from '@company/contracts';
import { DEMAND_BUSINESS_STATUSES, DEMAND_TYPES } from '@company/constants';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStartMaterialLine = (
  value: unknown,
): value is ProductionExecutionStartMaterialSnapshot['lines'][number] => {
  if (!isRecord(value) || Object.keys(value).length !== 11) return false;
  const stringFields = [
    'demandId',
    'itemId',
    'itemCode',
    'materialVariantId',
    'materialVariantCode',
    'unit',
    'demandQuantity',
    'confirmedOutboundQuantity',
    'remainingQuantity',
  ];
  return (
    stringFields.every((field) => typeof value[field] === 'string') &&
    DEMAND_TYPES.some((type) => type === value.demandType) &&
    DEMAND_BUSINESS_STATUSES.some((status) => status === value.businessStatus)
  );
};

const isStartMaterialSnapshot = (
  value: unknown,
): value is ProductionExecutionStartMaterialSnapshot =>
  isRecord(value) &&
  Object.keys(value).length === 3 &&
  typeof value.hasInitialMaterialConfiguration === 'boolean' &&
  typeof value.hasMaterialShortage === 'boolean' &&
  Array.isArray(value.lines) &&
  value.lines.every(isStartMaterialLine);

export const readStartMaterialSnapshot = (
  value: unknown,
): ProductionExecutionStartMaterialSnapshot | null => {
  if (value === null) return null;
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!isStartMaterialSnapshot(parsed)) throw new Error('任务开工物料快照结构无效');
  return parsed;
};
