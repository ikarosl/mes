import { effectScope } from 'vue';
import { describe, expect, it } from 'vitest';
import { useLatestRequest } from '../useLatestRequest';

describe('useLatestRequest', () => {
  it('only accepts the latest request in the same owner', () => {
    const latest = useLatestRequest();

    const first = latest.begin();
    const second = latest.begin();

    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('checks the target identity again when a response commits', () => {
    const latest = useLatestRequest();
    let targetId = 'product-a';

    const productA = latest.begin(() => targetId === 'product-a');
    targetId = 'product-b';

    expect(productA()).toBe(false);
    const productB = latest.begin(() => targetId === 'product-b');
    expect(productB()).toBe(true);
  });

  it('invalidates an in-flight request explicitly', () => {
    const latest = useLatestRequest();
    const pending = latest.begin();

    latest.invalidate();

    expect(pending()).toBe(false);
  });

  it('invalidates requests when the owning scope is disposed', () => {
    let latest: ReturnType<typeof useLatestRequest> | undefined;
    let pending: (() => boolean) | undefined;
    const scope = effectScope();

    scope.run(() => {
      latest = useLatestRequest();
      pending = latest.begin();
    });

    expect(pending?.()).toBe(true);
    scope.stop();
    expect(pending?.()).toBe(false);
  });
});
