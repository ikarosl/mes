import { describe, expect, it, vi } from 'vitest';
import { scanSecrets } from '../check-secrets.mjs';

describe('scanSecrets', () => {
  it('ignores a tracked path that has been deleted from the working tree', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    const read = vi.fn().mockRejectedValue(missing);

    await expect(scanSecrets(['deleted-file.ts'], read)).resolves.toEqual([]);
  });

  it('still reports secret patterns from files that exist', async () => {
    const read = vi.fn().mockResolvedValue(`token=ghp_${'a'.repeat(36)}`);

    await expect(scanSecrets(['source.ts'], read)).resolves.toEqual(['source.ts']);
  });

  it('does not suppress read failures other than a missing deleted path', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
    const read = vi.fn().mockRejectedValue(denied);

    await expect(scanSecrets(['source.ts'], read)).rejects.toBe(denied);
  });
});
