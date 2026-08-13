import { describe, expect, it } from 'vitest';
import { completeReworkResultCodec } from '../production-rework-result.codec.js';

describe('completeReworkResultCodec', () => {
  it('round-trips the rework, generated report and optional next disposition', () => {
    const value = {
      rework: {
        reworkId: '1',
        reworkNo: 'RW-1',
        abnormalDispositionId: '2',
        productionBatchId: '3',
        stepRecordId: '4',
        sourceReportId: '5',
        responsibleUserId: '6',
        responsibleUserName: '员工',
        reworkQuantity: '2.0000',
        unit: '件',
        status: 'completed',
        completedReportId: '7',
        startedAt: '2026-08-13T08:00:00+08:00',
        completedAt: '2026-08-13T09:00:00+08:00',
        version: 2,
        remark: null,
        createdAt: '2026-08-13T07:00:00+08:00',
      },
      report: {
        reportId: '7',
        reportNo: 'SR-RW-7',
        productionBatchId: '3',
        stepRecordId: '4',
        reportType: 'normal',
        reversalOfReportId: null,
        correctionOfReportId: null,
        reportedQuantity: '2.0000',
        normalQuantity: '2.0000',
        abnormalQuantity: '0.0000',
        unit: '件',
        remark: null,
        createdById: '6',
        createdByName: null,
        createdAt: '2026-08-13T09:00:00+08:00',
        isEffective: true,
      },
      abnormalDisposition: null,
    } as const;
    expect(completeReworkResultCodec.decode(completeReworkResultCodec.encode(value))).toEqual(
      value,
    );
  });
});
