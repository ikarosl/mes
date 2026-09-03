import { describe, expect, it, vi } from 'vitest';
import { selectShortBatchStartabilityByBatch } from '../mysql-production-short-batch.js';

describe('short-batch startability projection', () => {
  it('deduplicates batch ids and evaluates all candidate batches in one query', async () => {
    const query = vi.fn().mockResolvedValue([
      [
        { production_batch_id: 11, short_batch_startable: 1 },
        { production_batch_id: 12, short_batch_startable: 0 },
      ],
      [],
    ]);

    const result = await selectShortBatchStartabilityByBatch({ query } as never, [
      '11',
      '11',
      '12',
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual(['11', '12']);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('FROM production_batches b');
    expect(sql).toContain('WHERE b.id IN (?,?)');
    expect(sql).toContain("outbound_order.status='completed'");
    expect(sql).toContain("return_order.status='returned'");
    expect(sql).toContain('return_detail.release_after_return=1');
    expect(sql).not.toContain('batch_step_records');
    expect(result).toEqual(
      new Map([
        ['11', true],
        ['12', false],
      ]),
    );
  });

  it('does not query when no employee task batch exists', async () => {
    const query = vi.fn();

    await expect(selectShortBatchStartabilityByBatch({ query } as never, [])).resolves.toEqual(
      new Map(),
    );
    expect(query).not.toHaveBeenCalled();
  });
});
