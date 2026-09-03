import { MATERIAL_OUTBOUND_BLOCKED_LABELS } from '@company/constants';
import type {
  MaterialOutboundEligibility,
  ProductionBatchStatus,
  ShortBatchAuthorizationStatus,
} from '@company/contracts';

export interface MaterialOutboundEligibilityContext {
  batchStatus: ProductionBatchStatus;
  authorizationStatus: ShortBatchAuthorizationStatus;
  allActiveDemandsAllocated: boolean;
  hasActiveAllocation: boolean;
  hasOrderableAllocation: boolean;
  hasOrderableSupplementAllocation: boolean;
}

const blocked = (
  code: Exclude<MaterialOutboundEligibility['blockedCode'], null>,
): MaterialOutboundEligibility => ({
  eligible: false,
  outboundMode: null,
  blockedCode: code,
  blockedReason: MATERIAL_OUTBOUND_BLOCKED_LABELS[code],
});

/**
 * 出库候选列表与制单入口共享的展示资格投影。写事务仍必须在锁内重做相同事实校验。
 */
export const evaluateMaterialOutboundEligibility = (
  context: MaterialOutboundEligibilityContext,
): MaterialOutboundEligibility => {
  // 先确认存在仍可制单的有效分配；已释放、已取消或已出库的分配不能支撑新出库单。
  // 若批次仍有活动分配但全部不可制单，优先返回占用原因，帮助仓库区分“无分配”和“分配被占用”。
  if (!context.hasOrderableAllocation)
    return blocked(
      context.hasActiveAllocation ? 'no_orderable_allocation' : 'allocation_incomplete',
    );

  // 已齐套但尚未确认领料的批次走普通出库，不需要短批授权。
  if (context.batchStatus === 'material_assigned')
    return { eligible: true, outboundMode: 'normal', blockedCode: null, blockedReason: null };

  // 已完成过整组领料的未开工批次，只能因后续活动补料需求重新进入出库候选。
  if (context.batchStatus === 'material_outbound') {
    if (context.hasOrderableSupplementAllocation)
      return { eligible: true, outboundMode: 'normal', blockedCode: null, blockedReason: null };
    return blocked('allocation_incomplete');
  }

  if (context.batchStatus === 'doing') {
    // doing 表示批次已通过短批开工门禁；消耗过的授权只允许继续补齐缺料，不能再次按普通齐套制单。
    if (context.authorizationStatus === 'consumed')
      return {
        eligible: true,
        outboundMode: 'short_batch',
        blockedCode: null,
        blockedReason: null,
      };
    // 开工后的新增补料需求属于独立补料物流；有可制单补料分配时按普通模式继续出库。
    if (context.hasOrderableSupplementAllocation)
      return { eligible: true, outboundMode: 'normal', blockedCode: null, blockedReason: null };
    return blocked('allocation_incomplete');
  }

  if (context.batchStatus === 'material_partially_outbound') {
    // 首笔出库后，若当前全部活动需求已经分配完成，缺料风险已消失，后续单据恢复普通齐套模式。
    if (context.allActiveDemandsAllocated)
      return { eligible: true, outboundMode: 'normal', blockedCode: null, blockedReason: null };
    // 仍有分配缺口时，只有与当前 material_plan_version 匹配的有效授权才能继续短批出库。
    if (context.authorizationStatus === 'valid')
      return {
        eligible: true,
        outboundMode: 'short_batch',
        blockedCode: null,
        blockedReason: null,
      };
    // 计划变化会使旧授权失效；未授权或授权过期都必须先重新完成短批授权。
    return blocked(
      context.authorizationStatus === 'stale'
        ? 'short_batch_authorization_stale'
        : 'short_batch_authorization_required',
    );
  }

  if (context.batchStatus === 'material_pending') {
    // 尚未发生出库的未齐套批次，只能凭当前有效短批授权提前制单；普通分配不足不能绕过门禁。
    if (context.authorizationStatus === 'valid')
      return {
        eligible: true,
        outboundMode: 'short_batch',
        blockedCode: null,
        blockedReason: null,
      };
    // 这里区分“从未授权”和“授权因物料计划变化而失效”，便于前端引导正确的补救动作。
    return blocked(
      context.authorizationStatus === 'stale'
        ? 'short_batch_authorization_stale'
        : 'short_batch_authorization_required',
    );
  }

  // 其他批次状态不属于出库制单入口的合法状态，保持阻断而不是推测为可出库。
  return blocked('allocation_incomplete');
};
