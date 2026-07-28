import { describe, expect, it } from 'vitest';
import { buildLiveOptions, hasUnavailableSelection } from '../live-options';

describe('live options', () => {
  const options = [
    { id: 'active-1', name: '可用选项一' },
    { id: 'active-2', name: '可用选项二' },
  ];

  it('retains missing selected values as unavailable choices', () => {
    expect(buildLiveOptions(options, ['active-1', 'removed-1'], (item) => item.id)).toEqual([
      { value: 'active-1', option: options[0], isUnavailable: false },
      { value: 'active-2', option: options[1], isUnavailable: false },
      { value: 'removed-1', option: null, isUnavailable: true },
    ]);
  });

  it('detects selections that disappeared from refreshed options', () => {
    expect(hasUnavailableSelection(options, ['active-2'], (item) => item.id)).toBe(false);
    expect(hasUnavailableSelection(options, ['removed-1'], (item) => item.id)).toBe(true);
  });
});
