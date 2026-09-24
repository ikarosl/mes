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
}
export abstract class QualityInboundQuery {
  abstract listCases(query: QualityInboundCaseQuery): Promise<PageResult<QualityInboundCaseItem>>;
  abstract getCaseByInspection(inspectionId: string): Promise<QualityInboundCaseItem | null>;
  abstract getCase(caseId: string): Promise<QualityInboundCaseItem | null>;
  abstract getCases(caseIds: string[]): Promise<QualityInboundCaseItem[]>;
  abstract listOpenCases(input: { receiptLineIds: string[] }): Promise<QualityInboundCaseItem[]>;
  /** 只核实 Quality 的同源真实放行结论；调用方须锁定当前轮及正式执行范围，数量授权归Procurement。 */
  abstract requireReleaseBasis(
    input: QualityInboundReleaseBasis,
  ): Promise<QualityInboundInspectionItem>;
}
