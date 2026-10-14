import type {
  OtherInventoryDirection,
  OtherInventoryDraftPayload,
  OtherInventoryLine,
  OtherInventoryLinePayload,
} from '@company/contracts';
import { fixedIntegerQuantity, integerQuantity } from '@company/utils';
import { InventoryDomainError } from '../domain/inventory.errors.js';

interface OtherInventoryMetadata {
  order: string;
  detail: string;
  parent: string;
  number: string;
  quantity: string;
  at: string;
  pending: string;
  reference: string;
}

export const meta = (direction: OtherInventoryDirection): OtherInventoryMetadata =>
  direction === 'inbound'
    ? {
        order: 'inbound_order',
        detail: 'inbound_detail',
        parent: 'inbound_id',
        number: 'inbound_no',
        quantity: 'inbound_number',
        at: 'inbound_at',
        pending: 'pending',
        reference: 'inbound_detail',
      }
    : {
        order: 'outbound_order',
        detail: 'outbound_detail',
        parent: 'outbound_id',
        number: 'outbound_no',
        quantity: 'outbound_number',
        at: 'outbound_at',
        pending: 'pending_picking',
        reference: 'outbound_detail',
      };
export const id = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);
export const quantity = (value: unknown): string => fixedIntegerQuantity(String(value ?? 0));
export const clean = (value: string | null | undefined): string | null => value?.trim() || null;
export const sortIds = (values: string[]): string[] =>
  [...new Set(values)].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
export const fail = (message: string): never => {
  throw new InventoryDomainError('INVALID_INPUT', message);
};

export function validateOtherInventoryDraft(
  direction: OtherInventoryDirection,
  payload: OtherInventoryDraftPayload,
): void {
  if (!clean(payload.reason)) fail('办理原因不能为空');
  if (payload.details.length < 1 || payload.details.length > 50) fail('每单须包含1至50条有效明细');
  const groups = new Map<string, string>();
  for (const line of payload.details) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99_999_999)
      fail('数量必须为1至99999999的整数');
    if (
      line.itemKind === 'material'
        ? !line.materialVariantId || Boolean(line.productId)
        : !line.productId || Boolean(line.materialVariantId)
    )
      fail('库存对象身份无效');
    if (line.target.mode === 'new') {
      if (
        direction === 'outbound' ||
        !line.target.clientKey.trim() ||
        ('batchId' in line.target && line.target.batchId !== undefined)
      )
        fail('新增批次目标无效');
      const key = line.target.clientKey.trim(),
        identity = `${line.itemKind}:${line.materialVariantId ?? line.productId}`;
      if (groups.has(key) && groups.get(key) !== identity)
        fail('同一新增批次组必须使用相同对象和精确版本');
      groups.set(key, identity);
    } else if (
      !line.target.batchId ||
      ('clientKey' in line.target && line.target.clientKey !== undefined)
    )
      fail('请选择有效库存批次');
  }
}
export function otherInventoryPayloadLine(line: OtherInventoryLine): OtherInventoryLinePayload {
  return {
    id: line.id,
    itemKind: line.itemKind,
    ...(line.materialVariantId
      ? { materialVariantId: line.materialVariantId }
      : { productId: line.productId! }),
    quantity: integerQuantity(line.quantity),
    target:
      line.targetMode === 'new'
        ? { mode: 'new', clientKey: line.newBatchKey! }
        : { mode: 'existing', batchId: line.batchId! },
    remark: line.remark,
  };
}
