import { computed, ref, type Ref } from 'vue';
import { EMessage } from '../../utils/message';

/** 候选资源状态：idle 未请求 / loading 请求中 / ready 最近一次成功 / error 最近一次失败 */
export type RefreshableStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RefreshableOptions<T> {
  options: Readonly<Ref<T[]>>;
  loading: Readonly<Ref<boolean>>;
  status: Readonly<Ref<RefreshableStatus>>;
  refresh: () => Promise<void>;
}

/**
 * 局部候选实例（architecture.md §4.1）：
 *  - 只负责保存当前实例的候选、refresh() 重新请求、last-request-wins、失败保留上次成功快照。
 *  - 无单飞合并：每次 refresh() 都重新请求；并发调用由 request token 保证最后一次生效。
 *  - 无全局缓存 / 无失效标记：读取时机由消费方的明确操作决定，缓存页面返回不自动调用 refresh()。
 *  - refresh() 不 reject：失败保留上次成功结果并弹出局部 warning，调用方无需 catch。
 *
 * 所有权（T1）：谁持有实例，谁负责明确的读取入口；生命周期规则见 architecture.md §6。
 */
export function useRefreshableOptions<T>(
  request: () => Promise<T[]>,
  failureMessage: string,
): RefreshableOptions<T> {
  const options = ref<T[]>([]) as Ref<T[]>;
  const status = ref<RefreshableStatus>('idle');
  const loading = computed(() => status.value === 'loading');
  let requestToken = 0;

  const refresh = async (): Promise<void> => {
    const token = ++requestToken;
    status.value = 'loading';
    try {
      const latest = await request();
      if (token !== requestToken) return; // 已有更新的请求，丢弃迟到响应
      options.value = latest;
      status.value = 'ready';
    } catch {
      if (token !== requestToken) return; // 丢弃迟到失败，不误导提示
      status.value = 'error';
      EMessage.warning(failureMessage);
    }
  };

  return { options, loading, status, refresh };
}
