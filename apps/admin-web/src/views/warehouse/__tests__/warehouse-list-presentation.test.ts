import { describe, expect, it } from 'vitest';
import type { MaterialOutboundItem } from '@company/contracts';
import { outboundRowClass, outboundStatusHint } from '../warehouse-list-presentation';

describe('warehouse outbound list presentation', () => {
  it('explains whether an outbound has deducted stock', () => {
    expect(outboundStatusHint('pending_picking')).toBe('尚未扣减库存');
    expect(outboundStatusHint('completed')).toBe('已生成负库存流水');
    expect(outboundStatusHint('cancelled')).toBe('未产生负库存流水');
    expect(outboundRowClass({ row: { status: 'pending_picking' } as MaterialOutboundItem })).toBe(
      'status-warning-row',
    );
  });
});
