import type {
  PageResult,
  QualityInboundCaseItem,
  QualityInboundCaseQuery,
  QualityInboundInspectionItem,
} from '@company/contracts';

export interface QualityInboundReleaseBasis {
  inspectionId: string;
  caseId: string;
  receiptLineId: string;
  receiptRevisionId: string;
}
export abstract class QualityInboundQuery {
  abstract listCases(query: QualityInboundCaseQuery): Promise<PageResult<QualityInboundCaseItem>>;
  abstract getCase(caseId: string): Promise<QualityInboundCaseItem | null>;
  abstract getCases(caseIds: string[]): Promise<QualityInboundCaseItem[]>;
  abstract listOpenCases(input: { receiptLineIds: string[] }): Promise<QualityInboundCaseItem[]>;
  /** 只核实 Quality 的真实结论；调用方须已锁定有效 approved 范围。 */
  abstract requireReleaseBasis(
    input: QualityInboundReleaseBasis,
  ): Promise<QualityInboundInspectionItem>;
}
