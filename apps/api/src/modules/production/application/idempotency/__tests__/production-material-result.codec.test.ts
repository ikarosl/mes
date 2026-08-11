import { describe, expect, it } from 'vitest';
import {
  materialAllocationResultCodec,
  materialOutboundResultCodec,
} from '../production-material-result.codec.js';

describe('production material result codecs', () => {
  it('round-trips the complete allocation command result and rejects damaged snapshots', () => {
    const value = {
      productionBatchId: '1',
      batchStatus: 'material_assigned' as const,
      batchVersion: 2,
      allocations: [
        {
          allocationId: '9',
          demandId: '2',
          productionBatchId: '1',
          itemId: '3',
          itemBatchId: '4',
          batchCode: 'IB-1',
          assignedQuantity: '2.0000',
          outboundQuantity: '0.0000',
          remainingOutboundQuantity: '2.0000',
          unit: 'kg',
          allocationStatus: 'active' as const,
          version: 0,
          remark: null,
          createdAt: '2026-08-11T12:00:00+08:00',
        },
      ],
    };
    expect(
      materialAllocationResultCodec.decode(
        JSON.parse(JSON.stringify(materialAllocationResultCodec.encode(value))),
      ),
    ).toEqual(value);
    expect(() => materialAllocationResultCodec.decode({ productionBatchId: '1' })).toThrow();
  });

  it('round-trips the complete outbound result and rejects a partial stored snapshot', () => {
    const value = {
      productionBatchId: '1',
      batchStatus: 'material_outbound' as const,
      batchVersion: 3,
      outbound: {
        outboundId: '10',
        outboundNo: 'PMO-10',
        productionBatchId: '1',
        status: 'completed' as const,
        outboundAt: '2026-08-11T12:00:00+08:00',
        operatorId: '7',
        operatorName: '管理员',
        remark: null,
        details: [
          {
            id: '11',
            allocationId: '9',
            demandId: '2',
            itemId: '3',
            itemBatchId: '4',
            batchCode: 'IB-1',
            itemCode: 'MAT-1',
            itemName: '物料',
            outboundQuantity: '2.0000',
            unit: 'kg',
          },
        ],
      },
    };
    expect(
      materialOutboundResultCodec.decode(
        JSON.parse(JSON.stringify(materialOutboundResultCodec.encode(value))),
      ),
    ).toEqual(value);
    expect(() => materialOutboundResultCodec.decode({ productionBatchId: '1' })).toThrow();
  });
});
