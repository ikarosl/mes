import { describe, expect, it } from 'vitest';
import { inventorySourceTypeLabels, scrapSceneLabels, stockStatusLabels } from '../business-status';

describe('business status labels', () => {
  it('maps persisted English codes to Chinese labels', () => {
    expect(inventorySourceTypeLabels.purchased).toBe('外购');
    expect(stockStatusLabels.pending_inspection).toBe('待检');
    expect(scrapSceneLabels.return_after_outbound).toBe('退料后报废');
  });
});
