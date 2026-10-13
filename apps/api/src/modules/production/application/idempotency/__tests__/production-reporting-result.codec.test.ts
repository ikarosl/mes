import { describe, expect, it } from 'vitest';
import {
  correctStepReportResultCodec,
  createStepReportResultCodec,
} from '../production-reporting-result.codec.js';

const report = {
  reportId: '10',
  reportNo: 'SR-10',
  productionBatchId: '1',
  stepRecordId: '2',
  reportType: 'normal' as const,
  reversalOfReportId: null,
  correctionOfReportId: null,
  reportedQuantity: '4.0000',
  normalQuantity: '3.0000',
  abnormalQuantity: '1.0000',
  abnormalOrigin: 'current_step' as const,
  unit: '件',
  remark: null,
  createdById: '7',
  createdByName: null,
  createdAt: '2026-08-11T12:00:00+08:00',
  isEffective: true,
  canReverse: true,
  canCorrect: true,
  correctionBlockedReason: null,
};
const summary = {
  productionBatchId: '1',
  stepRecordId: '2',
  stepStatus: 'doing' as const,
  stepVersion: 3,
  upperLimitQuantity: '10.0000',
  requiredNormalQuantity: '10.0000',
  availableReportQuantity: '6.0000',
  effectiveReportedQuantity: '4.0000',
  effectiveDirectReportedQuantity: '4.0000',
  effectiveDirectNormalQuantity: '3.0000',
  effectiveDirectAbnormalQuantity: '1.0000',
  effectiveNormalQuantity: '3.0000',
  effectiveAbnormalQuantity: '1.0000',
  remainingNormalQuantity: '7.0000',
  previousStepNormalQuantity: null,
  directReportedVsPreviousNormalDifference: null,
  normalVsPreviousNormalDifference: null,
  normalVsTargetDifference: '-7.0000',
};

describe('production reporting result codecs', () => {
  it('round-trips complete create and correction results', () => {
    const created = { ...summary, report, abnormalDisposition: null };
    expect(createStepReportResultCodec.decode(createStepReportResultCodec.encode(created))).toEqual(
      created,
    );
    const corrected = {
      ...summary,
      reversal: {
        ...report,
        reportId: '11',
        reportType: 'reversal' as const,
        reversalOfReportId: '10',
        canReverse: false,
        canCorrect: false,
        correctionBlockedReason: '该记录仅供历史查看',
      },
      replacement: { ...report, reportId: '12', correctionOfReportId: '10' },
      abnormalDisposition: null,
    };
    expect(
      correctStepReportResultCodec.decode(correctStepReportResultCodec.encode(corrected)),
    ).toEqual(corrected);
  });

  it('rejects damaged stored results', () => {
    expect(() => createStepReportResultCodec.decode({ productionBatchId: '1' })).toThrow();
  });
});
