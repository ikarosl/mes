import { describe, expect, it } from 'vitest';
import type {
  InventoryBatchItem,
  MaterialOutboundItem,
  PurchaseInboundOrderItem,
} from '@company/contracts';
import {
  inboundRowClass,
  inboundStatusHint,
  inventoryAvailabilityHint,
  inventoryRowClass,
  outboundRowClass,
  outboundStatusHint,
} from '../warehouse-list-presentation';

describe('warehouse list presentation', () => {
  it('explains whether an inbound has affected stock', () => {
    expect(inboundStatusHint('pending')).toBe('尚未计入库存');
    expect(inboundStatusHint('completed')).toBe('已计入可分配库存');
    expect(inboundStatusHint('cancelled')).toBe('未产生库存');
    expect(inboundRowClass({ row: { status: 'pending' } as PurchaseInboundOrderItem })).toBe(
      'status-warning-row',
    );
  });

  it('explains whether an outbound has deducted stock', () => {
    expect(outboundStatusHint('pending_picking')).toBe('尚未扣减库存');
    expect(outboundStatusHint('completed')).toBe('已生成负库存流水');
    expect(outboundStatusHint('cancelled')).toBe('未产生负库存流水');
    expect(outboundRowClass({ row: { status: 'pending_picking' } as MaterialOutboundItem })).toBe(
      'status-warning-row',
    );
  });

  it('makes zero, reserved and frozen inventory consequences explicit', () => {
    const base = {
      batchStatus: 'available',
      availableToAllocateQuantity: '0.0000',
      reservedQuantity: '0.0000',
    } as InventoryBatchItem;
    expect(inventoryAvailabilityHint(base)).toBe('当前无可分配量');
    expect(inventoryRowClass({ row: base })).toBe('status-empty-row');
    expect(inventoryAvailabilityHint({ ...base, batchStatus: 'frozen' })).toBe('已冻结，不可分配');
    expect(
      inventoryAvailabilityHint({
        ...base,
        availableToAllocateQuantity: '8.0000',
        reservedQuantity: '2.0000',
      }),
    ).toBe('已扣除有效预留');
  });
});
