import type { IdempotentIntentStatus } from './useIdempotentIntent';
import { RouteMessageBox } from '../../utils/route-message-box';

/** 只结束本地恢复；不取消服务端操作，也不清空编辑草稿。 */
export async function confirmSubmissionRestart(recordsLabel: string): Promise<boolean> {
  try {
    await RouteMessageBox.confirm(
      `请先核对${recordsLabel}。上次操作可能已经成功，继续不会撤销它。当前输入会保留，但将结束上次提交的本地重试；再次提交会作为新操作，可能重复办理。`,
      '按新操作继续',
      { type: 'warning', confirmButtonText: '已核对，继续', cancelButtonText: '保留原提交' },
    );
    return true;
  } catch {
    return false;
  }
}

/** 只确认关闭；由编辑器在全部关闭条件满足后清理自己的请求与草稿。 */
export async function confirmSubmissionClose(
  status: IdempotentIntentStatus,
  options: { dirty?: boolean; entityLabel?: string } = {},
): Promise<boolean> {
  if (status === 'idle' && !options.dirty) return true;
  try {
    await RouteMessageBox.confirm(
      status !== 'idle'
        ? '提交结果尚未确认。请先核对相关记录；关闭后无法继续重试本次提交，重新办理可能重复操作，确认放弃吗？'
        : '当前修改尚未保存，确定放弃修改吗？',
      `关闭${options.entityLabel ?? '当前办理'}`,
      { type: 'warning', confirmButtonText: '确认放弃', cancelButtonText: '继续保留' },
    );
    return true;
  } catch {
    return false;
  }
}
