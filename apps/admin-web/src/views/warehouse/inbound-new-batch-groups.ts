import type { InventoryInboundTarget, OtherInventoryItemKind } from '@company/contracts';

export interface NewBatchGroupChoice {
  value: string;
  label: string;
  rowCount: number;
}

export interface InboundNewBatchGroup extends NewBatchGroupChoice {
  identityKey: string;
  hasConflictingIdentity: boolean;
}

export interface InboundBatchIdentity {
  itemKind: OtherInventoryItemKind;
  itemId?: string;
  materialVariantId?: string;
  productId?: string;
  unit: string;
}

export function inboundBatchIdentityKey(identity: InboundBatchIdentity): string {
  return JSON.stringify(
    identity.itemKind === 'material'
      ? [identity.itemKind, identity.itemId, identity.materialVariantId, identity.unit]
      : [identity.itemKind, identity.productId, identity.unit],
  );
}

/** 每个成员直接持有批次组键；组选项由当前明细派生，不依赖一条主行继续存在。 */
export function buildInboundNewBatchGroups<T extends { target: InventoryInboundTarget }>(
  rows: readonly T[],
  identify: (row: T) => string,
): InboundNewBatchGroup[] {
  const groups = new Map<string, InboundNewBatchGroup>();
  rows.forEach((row, index) => {
    if (row.target.mode !== 'new' || !row.target.clientKey) return;
    const identityKey = identify(row);
    const existing = groups.get(row.target.clientKey);
    if (existing) {
      existing.rowCount += 1;
      existing.hasConflictingIdentity ||= existing.identityKey !== identityKey;
      return;
    }
    groups.set(row.target.clientKey, {
      value: row.target.clientKey,
      label: `第 ${index + 1} 行的新批次`,
      rowCount: 1,
      identityKey,
      hasConflictingIdentity: false,
    });
  });
  return [...groups.values()].map((group) => ({
    ...group,
    label: `${group.label}${group.rowCount > 1 ? `（${group.rowCount} 行共用）` : '（独立新建）'}`,
  }));
}
