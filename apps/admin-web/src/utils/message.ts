import { ElMessage } from 'element-plus';
import { isHttpErrorHandled } from '../api/http-error-state';

/** 管理端统一消息入口，符合 design.md §7 表单规范。 */
export const EMessage = {
  success: (message: string) => ElMessage.success(message),
  warning: (message: string) => ElMessage.warning(message),
  info: (message: string) => ElMessage.info(message),
  error: (error: unknown, fallback = '操作失败，请稍后重试') => {
    if (isHttpErrorHandled(error)) return;
    ElMessage.error(
      typeof error === 'string'
        ? error
        : error instanceof Error && error.message
          ? error.message
          : fallback,
    );
  },
};
