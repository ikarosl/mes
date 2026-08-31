import { ElMessage } from 'element-plus';
import { isHttpErrorHandled } from '../api/http-error-state';

/** 同文案错误在窗口内只弹首条，其余计数并在窗口结束后合并为一条汇总，避免并发请求失败刷屏。 */
const ERROR_MERGE_WINDOW_MS = 3_000;

let lastErrorText: string | null = null;
let mergedErrorCount = 0;
let mergeTimer: ReturnType<typeof setTimeout> | undefined;

const flushMergedErrors = () => {
  if (mergeTimer !== undefined) {
    clearTimeout(mergeTimer);
    mergeTimer = undefined;
  }
  if (mergedErrorCount > 0) {
    ElMessage.info(`另有 ${mergedErrorCount} 条相同错误，已合并提示`);
  }
  mergedErrorCount = 0;
  lastErrorText = null;
};

const notifyError = (message: string) => {
  if (message === lastErrorText) {
    mergedErrorCount += 1;
    return;
  }
  flushMergedErrors();
  lastErrorText = message;
  ElMessage.error(message);
  mergeTimer = setTimeout(flushMergedErrors, ERROR_MERGE_WINDOW_MS);
};

/** 管理端统一消息入口，符合 visual-design.md §7 表单规范。 */
export const EMessage = {
  success: (message: string) => ElMessage.success(message),
  warning: (message: string) => ElMessage.warning(message),
  info: (message: string) => ElMessage.info(message),
  error: (error: unknown, fallback = '操作失败，请稍后重试') => {
    if (isHttpErrorHandled(error)) return;
    notifyError(
      typeof error === 'string'
        ? error
        : error instanceof Error && error.message
          ? error.message
          : fallback,
    );
  },
};

/** 仅供测试：静默清空错误合并窗口状态。 */
export const resetErrorMessageMergeForTests = () => {
  if (mergeTimer !== undefined) {
    clearTimeout(mergeTimer);
    mergeTimer = undefined;
  }
  mergedErrorCount = 0;
  lastErrorText = null;
};
