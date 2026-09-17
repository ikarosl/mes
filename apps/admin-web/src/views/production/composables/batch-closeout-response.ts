import type { BatchCloseoutDetail, BatchTerminationCheck } from '@company/contracts';

/** HTTP 类型声明不校验响应：先检查弹窗使用的结构，再整体更新可渲染状态。 */
export function validateCloseoutResponse(
  preview: BatchTerminationCheck,
  closeout: BatchCloseoutDetail | null,
  batchId: string,
): void {
  const validCheck = (value: BatchTerminationCheck | null | undefined) =>
    value !== null &&
    typeof value === 'object' &&
    value.batchId === batchId &&
    typeof value.checkToken === 'string' &&
    Number.isInteger(value.version) &&
    Array.isArray(value.impacts) &&
    Array.isArray(value.materials) &&
    Array.isArray(value.blockers);
  if (!validCheck(preview)) throw new Error('收尾核对响应格式异常，请刷新重试');
  // JSON null 表示没有逐项收尾记录；是否已结束由核对中的 termination 判断。
  if (closeout === null) return;
  if (
    typeof closeout !== 'object' ||
    !closeout ||
    closeout.batchId !== batchId ||
    typeof closeout.id !== 'string' ||
    typeof closeout.reason !== 'string' ||
    !Number.isInteger(closeout.version) ||
    typeof closeout.canHandle !== 'boolean' ||
    !validCheck(closeout.check) ||
    !Array.isArray(closeout.demands) ||
    !Array.isArray(closeout.pendingItems) ||
    !Array.isArray(closeout.materialReviews) ||
    !Array.isArray(closeout.actions) ||
    !Array.isArray(closeout.blockers)
  )
    throw new Error('收尾详情响应格式异常，请刷新重试');
}
