import type { BatchStepAbnormalDispositionItem, ReworkRecordItem } from '@company/contracts';
import { EMessage } from '../../../utils/message';

type Actions = {
  approveRework: (item: BatchStepAbnormalDispositionItem, remark: string) => Promise<void>;
  rejectDisposition: (item: BatchStepAbnormalDispositionItem, reason: string) => Promise<void>;
  approveScrapSupplement: (
    item: BatchStepAbnormalDispositionItem,
    planVersion: number,
  ) => Promise<void>;
  startRework: (item: ReworkRecordItem) => Promise<void>;
  completeRework: (
    item: ReworkRecordItem,
    normalQuantity: number,
    abnormalQuantity: number,
    remark: string,
  ) => Promise<void>;
};

export const useProductionAbnormalActions = (actions: Actions) => ({
  handleApproveRework: async (item: BatchStepAbnormalDispositionItem, remark: string) => {
    try {
      await actions.approveRework(item, remark);
      EMessage.success('异常已批准返工');
    } catch (error) {
      EMessage.error(error, '批准返工失败，请刷新后重试');
    }
  },
  handleRejectDisposition: async (item: BatchStepAbnormalDispositionItem, reason: string) => {
    try {
      await actions.rejectDisposition(item, reason);
      EMessage.success('异常报工已冲销并退回重报');
    } catch (error) {
      EMessage.error(error, '异常驳回失败，请刷新后重试');
    }
  },
  handleApproveScrapSupplement: async (
    item: BatchStepAbnormalDispositionItem,
    planVersion: number,
  ) => {
    try {
      await actions.approveScrapSupplement(item, planVersion);
      EMessage.success('异常已批准报废并生成补料需求');
    } catch (error) {
      EMessage.error(error, '报废补料批准失败，请刷新后核对候选物料和数量');
      throw error;
    }
  },
  handleStartRework: async (item: ReworkRecordItem) => {
    try {
      await actions.startRework(item);
      EMessage.success('返工已开始');
    } catch (error) {
      EMessage.error(error, '返工开始失败，请确认当前账号是返工负责人');
    }
  },
  handleCompleteRework: async (
    item: ReworkRecordItem,
    normalQuantity: number,
    abnormalQuantity: number,
    remark: string,
  ) => {
    try {
      await actions.completeRework(item, normalQuantity, abnormalQuantity, remark);
      EMessage.success('返工已完成并生成报工事实');
    } catch (error) {
      EMessage.error(error, '返工完成失败，请刷新后核对数量和单据状态');
    }
  },
});
