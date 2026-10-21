import type {
  BatchCloseoutMaterialReview,
  BatchTerminationCheck,
  BatchTerminationImpact,
} from '@company/contracts';
import { ProductionDomainError } from './production.errors.js';

/** 当前事实的处理顺序同时用于工作台提示和写入前资格复核。 */
export function closeoutItemBlockedReason(
  impact: BatchTerminationImpact,
  impacts: readonly BatchTerminationImpact[],
): string | null {
  const has = (kind: BatchTerminationImpact['kind']) => impacts.some((item) => item.kind === kind);
  if (impact.kind === 'outbound' && impact.status !== 'pending_picking')
    return '请先在出库管理处理已拣料或部分出库单';
  if (impact.kind === 'allocation' && has('outbound')) return '先处理全部待出库单，再释放分配';
  if (impact.kind === 'demand' && (has('outbound') || has('allocation')))
    return '先处理待出库单、剩余预留及冻结或异常分配，再关闭需求';
  if (impact.kind === 'supplement' && (has('outbound') || has('allocation') || has('demand')))
    return '先完成出库、分配和剩余需求收尾，再处理补料单';
  return null;
}

export function closeoutReviewBlockers(
  check: Pick<BatchTerminationCheck, 'blockers' | 'impacts'>,
  hasPendingApproval: boolean,
  materialReviews: readonly Pick<BatchCloseoutMaterialReview, 'status'>[],
): string[] {
  const blockers = [...check.blockers];
  if (check.impacts.length) blockers.push('逐项完成所有需求、工序及关联单据的收尾处理');
  if (hasPendingApproval) blockers.push('收尾审批正在进行');
  if (materialReviews.some((review) => review.status !== 'reviewed'))
    blockers.push('逐项核对物料安排；领退料或损耗变化后须重新核对');
  return blockers;
}

export function requireEditableCloseout(
  version: number,
  expectedVersion: number,
  hasPendingApproval: boolean,
  hasApprovedRevision: boolean,
): void {
  if (version !== expectedVersion)
    throw new ProductionDomainError('CONCURRENT_MODIFICATION', '收尾记录已变化，请刷新');
  if (hasPendingApproval || hasApprovedRevision)
    throw new ProductionDomainError('INVALID_STATE', '收尾已送审或结束，不能继续编辑');
}
