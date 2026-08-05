import { ref } from 'vue';

/**
 * 行级写操作提交守卫（todo 3.5）。
 * 表格行内写操作（启停、删除、下达、关闭、取消、生成物料等）统一用该守卫：
 *  - beginRow(id) 在 handler 入口同步占用，同一行在途期间重复触发返回 false；
 *  - endRow(id) 在 finally 中释放，保证取消、失败或成功后按钮恢复可用；
 *  - isRowPending(id) 绑定行内写按钮的 disabled，避免重复确认与重复请求。
 *
 * 交互层守卫不替代服务端幂等，仅拦截多余请求与 409；最终一致性仍由后端
 * version 乐观锁与业务校验保证（见 docs/todo.md §3.5）。
 */
export function useRowPending() {
  /** 正在执行行内写操作的行 ID 集合 */
  const pendingIds = ref<Set<string>>(new Set());

  const isRowPending = (id: string): boolean => pendingIds.value.has(id);

  /** 尝试占用一行写操作；该行已有写操作在途时返回 false，调用方应直接返回 */
  const beginRow = (id: string): boolean => {
    if (pendingIds.value.has(id)) return false;
    pendingIds.value.add(id);
    return true;
  };

  const endRow = (id: string): void => {
    pendingIds.value.delete(id);
  };

  return { pendingIds, isRowPending, beginRow, endRow };
}
