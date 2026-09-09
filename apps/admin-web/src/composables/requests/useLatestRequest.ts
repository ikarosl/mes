import { getCurrentScope, onScopeDispose } from 'vue';

/** Each owner has its own sequence; only its latest request may commit state. */
export const useLatestRequest = () => {
  let version = 0;
  const invalidate = (): void => {
    version += 1;
  };
  const begin = (matchesTarget: () => boolean = () => true): (() => boolean) => {
    const requestVersion = ++version;
    return () => requestVersion === version && matchesTarget();
  };
  if (getCurrentScope()) onScopeDispose(invalidate);
  return { begin, invalidate };
};
