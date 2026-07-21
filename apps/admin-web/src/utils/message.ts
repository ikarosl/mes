import { ElMessage } from 'element-plus';

/** 管理端统一消息入口，符合 design.md §7 表单规范。 */
export const EMessage = {
  success: (message: string) => ElMessage.success(message),
  warning: (message: string) => ElMessage.warning(message),
  info: (message: string) => ElMessage.info(message),
  error: (error: unknown, fallback = '操作失败，请稍后重试') =>
    ElMessage.error(
      typeof error === 'string'
        ? error
        : error instanceof Error && error.message
          ? error.message
          : fallback,
    ),
};
