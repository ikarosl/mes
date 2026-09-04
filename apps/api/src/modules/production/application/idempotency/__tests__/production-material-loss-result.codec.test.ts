import { describe, expect, it } from 'vitest';
import {
  confirmMaterialLossResultCodec,
  createMaterialLossResultCodec,
} from '../production-material-loss-result.codec.js';

const value = {
  id: '1',
  scrapNo: 'SH-1',
  productionBatchId: '2',
  batchNo: 'PB-1',
  workOrderId: '3',
  workOrderNo: 'WO-1',
  productCode: 'FG-1',
  productName: '成品一',
  allocationId: '4',
  demandId: '5',
  itemId: '6',
  materialVariantId: 'v6',
  materialVariantCode: 'RM-1-v1-A',
  itemCode: 'RM-1',
  itemName: '原料一',
  itemBatchId: '7',
  batchCode: 'LOT-1',
  scrapScene: 'production_consumed' as const,
  scrapQuantity: '1.0000',
  unit: '件',
  reasonType: '搬运损坏',
  status: 'confirmed' as const,
  confirmedById: '8',
  confirmedByName: '管理员',
  confirmedAt: '2026-08-20T10:00:00+08:00',
  createdById: '9',
  createdByName: '现场人员',
  createdAt: '2026-08-20T09:00:00+08:00',
  version: 1,
  remark: null,
  supplement: {
    supplementId: '10',
    supplementNo: 'BL-1',
    status: 'approved' as const,
    demandId: '11',
    demandQuantity: '1.0000',
  },
};

describe('production material-loss result codecs', () => {
  it('round-trips the complete canonical result for create and confirm', () => {
    expect(
      createMaterialLossResultCodec.decode(createMaterialLossResultCodec.encode(value)),
    ).toEqual(value);
    expect(
      confirmMaterialLossResultCodec.decode(confirmMaterialLossResultCodec.encode(value)),
    ).toEqual(value);
  });

  it('rejects incomplete stored snapshots', () => {
    expect(() => createMaterialLossResultCodec.decode({ id: '1' })).toThrow();
    expect(() =>
      confirmMaterialLossResultCodec.decode({ ...value, supplement: { supplementId: '10' } }),
    ).toThrow();
  });
});
