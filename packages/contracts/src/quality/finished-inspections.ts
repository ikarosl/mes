import type { PageQuery, VersionedCommand } from '../common.js';
import type { ProductionOutputQuantities } from '../production/output.js';

export type ProductionOutputInspectionMethod = 'full' | 'sampling' | 'zero_confirmation';
export type ProductionOutputReleaseDecision = 'released' | 'pending_reinspection' | 'not_released';
export interface ProductionOutputInspectionFacts {
  inspectionMethod: ProductionOutputInspectionMethod;
  /** 质检核实的整批实物量，不采用产线申报快照作为事实。 */
  coveredQuantity: number;
  /** 独立填写的合格数与不合格数之和；全检等于送检总数。 */
  inspectedQuantity: number;
  unqualifiedQuantity: number;
  releaseDecision: ProductionOutputReleaseDecision;
}
export interface ProductionOutputInspection extends ProductionOutputInspectionFacts {
  id: string;
  closeoutId: string;
  batchId: string;
  declaredVersion: number;
  declared: ProductionOutputQuantities;
  /** 实际检查合格数；抽检时仅表示样本合格数。 */
  qualifiedQuantity: number;
  /** 明确放行时为送检总数减实检不合格数，其他结论为零；由服务端计算。 */
  releasedQuantity: number;
  inspectedAt: string;
  resultNote: string;
  evidenceReference: string;
  previousInspectionId: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}
export interface RecordFinishedInspectionPayload extends VersionedCommand {
  inspectionMethod: ProductionOutputInspectionMethod;
  /** 独立填写的本次实检合格数；抽检时为样本合格数。 */
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  /** 抽检必填；全检及零量核实可省略，显式提交须与合格加不合格一致。 */
  coveredQuantity?: number;
  releaseDecision: ProductionOutputReleaseDecision;
  inspectedAt: string;
  resultNote: string;
  evidenceReference: string;
}
export type FinishedInspectionListStatus = 'pending' | 'recorded';
export interface FinishedInspectionTaskQuery extends PageQuery {
  keyword?: string;
  status?: FinishedInspectionListStatus;
}
export interface FinishedInspectionTaskItem {
  batchId: string;
  batchNo: string;
  workOrderId: string;
  workOrderNo: string;
  productCode: string;
  productName: string;
  plannedQuantity: string;
  version: number;
  latestInspectionId: string | null;
  latestReleaseDecision: ProductionOutputReleaseDecision | null;
  latestInspectedAt: string | null;
  canRecordInspection: boolean;
}
export interface FinishedInspectionTaskDetail extends FinishedInspectionTaskItem {
  declared: ProductionOutputQuantities | null;
  latestInspection: ProductionOutputInspection | null;
}
export interface FinishedInspectionCommandResult {
  batchId: string;
  inspectionId: string;
  version: number;
}
