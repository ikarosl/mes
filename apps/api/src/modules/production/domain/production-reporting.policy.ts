import { PERMISSIONS, PRODUCTION_STEP_PERMISSION_LABELS } from '@company/constants';
import { ProductionDomainError } from './production.errors.js';
import { integerQuantity, MAX_PERSISTED_INTEGER_QUANTITY } from './integer-quantity.js';
import type {
  BatchStepAbnormalOrigin,
  BatchStepStatus,
  ProductionBatchStatus,
} from '@company/contracts';

const REPORT_PERMISSION_LABEL =
  PRODUCTION_STEP_PERMISSION_LABELS[PERMISSIONS.production.steps.report];
const MANAGE_EXECUTION_PERMISSION_LABEL =
  PRODUCTION_STEP_PERMISSION_LABELS[PERMISSIONS.production.steps.manageExecution];

export type ProductionReportingAccess = {
  actorId: string | null;
  canManageExecution: boolean;
  canReport: boolean;
  canReadAllReports: boolean;
};

export const reportingPhase = (
  status: ProductionBatchStatus,
): 'execution' | 'history' | 'unavailable' =>
  status === 'doing'
    ? 'execution'
    : ['closing', 'completed', 'terminated'].includes(status)
      ? 'history'
      : 'unavailable';

type ReportCorrectionEligibility = {
  canCorrectReport: boolean;
  correctionBlockedReason: string | null;
  canCreateHistoricalReport: boolean;
  historicalCorrectionBlockedReason: string | null;
};

/** 纠错资格独立于新增剩余量，替代后仍校验统一上限。 */
export const reportCorrectionEligibility = (
  batchStatus: ProductionBatchStatus,
  pendingApprovalId: string | null,
  stepStatus: BatchStepStatus,
  responsibleUserId: string | null,
  access: ProductionReportingAccess,
): ReportCorrectionEligibility => {
  const phase = reportingPhase(batchStatus);
  const reason = pendingApprovalId
    ? '结案或产出更正正在审批，状态和报工均已冻结'
    : phase !== 'execution'
      ? '任务已经结束执行，员工只读；管理员请使用历史纠错'
      : !['doing', 'completed'].includes(stepStatus)
        ? '工序尚未开始或已终止，不能办理执行报工'
        : !access.canReport && !access.canManageExecution
          ? `需要「${REPORT_PERMISSION_LABEL}」或「${MANAGE_EXECUTION_PERMISSION_LABEL}」权限`
          : !access.canManageExecution && responsibleUserId !== access.actorId
            ? '只有当前工序负责人可以办理'
            : null;
  const historicalReason = pendingApprovalId
    ? '结案或产出更正正在审批，状态和报工均已冻结'
    : phase !== 'history'
      ? '任务尚未进入结案或批准结束阶段'
      : !access.canManageExecution
        ? `历史报工纠错需要「${MANAGE_EXECUTION_PERMISSION_LABEL}」权限`
        : null;
  return {
    canCorrectReport: reason === null,
    correctionBlockedReason: reason,
    canCreateHistoricalReport: historicalReason === null,
    historicalCorrectionBlockedReason: historicalReason,
  };
};

export const reportWriteEligibility = (
  batchStatus: ProductionBatchStatus,
  pendingApprovalId: string | null,
  stepStatus: BatchStepStatus,
  responsibleUserId: string | null,
  access: ProductionReportingAccess,
  availableReportQuantity: number | string,
): ReportCorrectionEligibility & { canReport: boolean; reportBlockedReason: string | null } => {
  const correction = reportCorrectionEligibility(
    batchStatus,
    pendingApprovalId,
    stepStatus,
    responsibleUserId,
    access,
  );
  const reason =
    correction.correctionBlockedReason ??
    (stepStatus === 'completed'
      ? '工序已完成，请重新开工后再报工'
      : integerQuantity(availableReportQuantity) <= 0
        ? '本工序剩余报工额度为零，请核对报工记录或等待补产授权生效'
        : null);
  return {
    ...correction,
    canReport: reason === null,
    reportBlockedReason: reason,
  };
};

export const requireReportQuantities = (normalQuantity: number, abnormalQuantity: number): void => {
  let normal: number;
  let abnormal: number;
  try {
    normal = integerQuantity(normalQuantity);
    abnormal = integerQuantity(abnormalQuantity);
  } catch {
    throw new ProductionDomainError('INVALID_INPUT', '本次报工数量必须为整数');
  }
  if (
    normal < 0 ||
    abnormal < 0 ||
    normal + abnormal <= 0 ||
    normal + abnormal > MAX_PERSISTED_INTEGER_QUANTITY
  )
    throw new ProductionDomainError('INVALID_INPUT', '本次报工数量必须大于零且不能为负数');
};

export const requireDirectReportQuantities = (
  normalQuantity: number,
  abnormalQuantity: number,
): void => {
  requireReportQuantities(normalQuantity, abnormalQuantity);
  if (normalQuantity > 0 && abnormalQuantity > 0)
    throw new ProductionDomainError('INVALID_INPUT', '正常报工与异常报工必须分别提交');
};

export const requireNormalReportCorrectionQuantity = (normalQuantity: number): void => {
  let normal: number;
  try {
    normal = integerQuantity(normalQuantity);
  } catch {
    throw new ProductionDomainError('INVALID_INPUT', '更正数量必须为整数');
  }
  if (normal <= 0 || normal > MAX_PERSISTED_INTEGER_QUANTITY)
    throw new ProductionDomainError(
      'INVALID_INPUT',
      '更正数量必须为大于零的整数，撤回整笔报工请使用冲销',
    );
};

export const requireAbnormalOrigin = (
  abnormalQuantity: number,
  abnormalOrigin: BatchStepAbnormalOrigin | null | undefined,
  hasPreviousStep: boolean,
): BatchStepAbnormalOrigin | null => {
  if (abnormalQuantity > 0 && !abnormalOrigin)
    throw new ProductionDomainError('INVALID_INPUT', '存在异常数量时必须选择本工序异常或前置异常');
  if (abnormalQuantity === 0 && abnormalOrigin)
    throw new ProductionDomainError('INVALID_INPUT', '没有异常数量时不得填写异常来源');
  if (abnormalOrigin === 'previous_step' && !hasPreviousStep)
    throw new ProductionDomainError('INVALID_INPUT', '首道工序不能上报前置工序异常');
  return abnormalQuantity > 0 ? abnormalOrigin! : null;
};

export const requireReportWithinUpperLimit = (
  currentEffectiveReported: number | string,
  normalDelta: number | string,
  abnormalDelta: number | string,
  upperLimitQuantity: number | string,
): void => {
  if (
    integerQuantity(currentEffectiveReported) +
      integerQuantity(normalDelta) +
      integerQuantity(abnormalDelta) >
    integerQuantity(upperLimitQuantity)
  )
    throw new ProductionDomainError(
      'STEP_REPORT_QUANTITY_EXCEEDED',
      '本次正常与异常数量合计超过任务统一报工上限',
    );
};
