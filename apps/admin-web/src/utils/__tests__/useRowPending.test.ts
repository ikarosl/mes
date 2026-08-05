import { beforeEach, describe, expect, it } from 'vitest';
import { useRowPending } from '../useRowPending';

describe('useRowPending', () => {
  let state: ReturnType<typeof useRowPending>;

  beforeEach(() => {
    state = useRowPending();
  });

  it('allows a row write and blocks re-entry until released', () => {
    expect(state.beginRow('1')).toBe(true);
    expect(state.isRowPending('1')).toBe(true);
    expect(state.beginRow('1')).toBe(false); // 在途期间重复触发被拦截
    state.endRow('1');
    expect(state.isRowPending('1')).toBe(false);
    expect(state.beginRow('1')).toBe(true); // 释放后可再次进入
  });

  it('tracks different rows independently', () => {
    expect(state.beginRow('a')).toBe(true);
    expect(state.beginRow('b')).toBe(true);
    expect(state.isRowPending('a')).toBe(true);
    expect(state.isRowPending('b')).toBe(true);
    state.endRow('a');
    expect(state.isRowPending('a')).toBe(false);
    expect(state.isRowPending('b')).toBe(true);
    expect(state.beginRow('b')).toBe(false); // b 仍在途
  });

  it('stays released after repeated end calls', () => {
    state.beginRow('1');
    state.endRow('1');
    state.endRow('1');
    expect(state.isRowPending('1')).toBe(false);
    expect(state.beginRow('1')).toBe(true);
  });
});
