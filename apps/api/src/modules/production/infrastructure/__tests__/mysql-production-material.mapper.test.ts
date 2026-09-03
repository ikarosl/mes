import { describe, expect, it } from 'vitest';
import { mapDemand, type DemandRow } from '../mysql-production-material.mapper.js';

const demandRow = (
  overrides: Partial<
    Pick<DemandRow, 'id' | 'allocated_quantity' | 'outbound_quantity' | 'business_status'>
  > = {},
): DemandRow =>
  ({
    id: 1,
    production_batch_id: 2,
    product_material_id: 3,
    item_id: 4,
    item_code_snapshot: 'MAT-001',
    item_name_snapshot: '物料 A',
    unit_snapshot: 'pcs',
    need_number: '10.0000',
    remaining_number: '8',
    demand_type: 'normal',
    generation_group_key: 'NORMAL:2',
    supplement_id: null,
    supplement_no: null,
    business_status: 'active',
    fulfilled_by: null,
    fulfilled_at: null,
    version: 0,
    created_at: new Date('2026-09-01T01:00:00.000Z'),
    allocated_quantity: '6.0000',
    outbound_quantity: '2.0000',
    ...overrides,
  }) as DemandRow;

describe('mysql production material demand mapper', () => {
  it('exposes demand-level progress explicitly', () => {
    const result = mapDemand(demandRow(), []);

    expect(result.demandProgressStatus).toBe('shortage');
    expect(result).toMatchObject({
      generationGroupKey: 'NORMAL:2',
      generationGroupType: 'normal',
      supplementId: null,
      supplementNo: null,
    });
    expect(result).not.toHaveProperty('progressStatus');
  });

  it('calculates progress independently for each demand row', () => {
    expect(
      mapDemand(demandRow({ id: 1, allocated_quantity: '10', outbound_quantity: '10' }), [])
        .demandProgressStatus,
    ).toBe('outbound');
    expect(
      mapDemand(demandRow({ id: 2, allocated_quantity: '10', outbound_quantity: '0' }), [])
        .demandProgressStatus,
    ).toBe('allocated');
    expect(
      mapDemand(demandRow({ id: 3, allocated_quantity: '4', outbound_quantity: '0' }), [])
        .demandProgressStatus,
    ).toBe('partially_allocated');
  });

  it('projects terminal demand business statuses into display progress', () => {
    expect(
      mapDemand(
        demandRow({
          business_status: 'fulfilled',
          allocated_quantity: '10',
          outbound_quantity: '6',
        }),
        [],
      ).demandProgressStatus,
    ).toBe('outbound');
    expect(mapDemand(demandRow({ business_status: 'cancelled' }), []).demandProgressStatus).toBe(
      'cancelled',
    );
  });
});
