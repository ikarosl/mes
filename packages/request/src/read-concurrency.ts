import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

type Release = () => void;

const isRead = (method: string | undefined): boolean => {
  const normalized = (method ?? 'GET').toUpperCase();
  return normalized === 'GET' || normalized === 'HEAD';
};

export const installReadConcurrency = (client: AxiosInstance, maximum: number): void => {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new RangeError('maxConcurrentReads must be a positive integer');

  let active = 0;
  const queue = new Set<() => void>();
  const wrappedAdapters = new WeakSet<AxiosAdapter>();
  const acquire = (config: InternalAxiosRequestConfig): Promise<Release> =>
    new Promise((resolve, reject) => {
      let waiting = true;
      const cleanup = (): void => {
        config.signal?.removeEventListener?.('abort', cancel);
        config.cancelToken?.unsubscribe(cancel);
      };
      const cancel = (): void => {
        if (!waiting) return;
        waiting = false;
        queue.delete(start);
        cleanup();
        reject(new axios.CanceledError(undefined, config));
      };
      const start = (): void => {
        if (!waiting) return;
        waiting = false;
        cleanup();
        active += 1;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          active -= 1;
          const next = queue.values().next().value;
          if (next) {
            queue.delete(next);
            next();
          }
        });
      };
      if (config.signal?.aborted || config.cancelToken?.reason) {
        cancel();
        return;
      }
      if (active < maximum) {
        start();
        return;
      }
      queue.add(start);
      config.signal?.addEventListener?.('abort', cancel, { once: true });
      config.cancelToken?.subscribe(cancel);
    });

  client.interceptors.request.use((config) => {
    if (!isRead(config.method)) return config;
    if (typeof config.adapter === 'function' && wrappedAdapters.has(config.adapter)) return config;

    const originalAdapter = config.adapter ?? client.defaults.adapter;
    const adapter: AxiosAdapter = async (attempt) => {
      const transport = axios.getAdapter(originalAdapter);
      if (!isRead(attempt.method)) return transport(attempt);
      const release = await acquire(attempt);
      try {
        // 排队请求获准后、恢复执行前仍可能被取消。
        if (attempt.signal?.aborted || attempt.cancelToken?.reason)
          throw new axios.CanceledError(undefined, attempt);
        return await transport(attempt);
      } finally {
        // 在响应拦截器重试或认证重放前归还本次网络尝试的名额。
        release();
      }
    };
    wrappedAdapters.add(adapter);
    return { ...config, adapter };
  });
};
