import { describe, expect, it } from 'vitest';
import type { DemandGenerationGroupType } from '@company/contracts';
import {
  groupMaterialDemandRows,
  materialDemandGroupLabel,
} from '../material-demand-group-presentation';

describe('material demand group presentation', () => {
  it('keeps generation order and groups allocation rows without aggregating their facts', () => {
    const rows = [
      row('NORMAL:8', 'normal', null, 'a1'),
      row('NORMAL:8', 'normal', null, 'a2'),
      row('SCRAPSUP:21', 'scrap_supplement', 'SUP-00021', 'a3'),
    ];

    const groups = groupMaterialDemandRows(rows);

    expect(groups.map((group) => group.label)).toEqual(['初始物料需求', '报废补料 SUP-00021']);
    expect(groups[0]?.rows.map((item) => item.allocationId)).toEqual(['a1', 'a2']);
    expect(groups[1]?.rows.map((item) => item.allocationId)).toEqual(['a3']);
  });

  it('uses the shared demand-group type label for outbound trace display', () => {
    expect(
      materialDemandGroupLabel({
        generationGroupKey: 'SCRAPSUP:9',
        generationGroupType: 'scrap_supplement',
        supplementNo: 'SUP-00009',
      }),
    ).toBe('报废补料 SUP-00009');
  });
});

const row = (
  generationGroupKey: string,
  generationGroupType: DemandGenerationGroupType,
  supplementNo: string | null,
  allocationId: string,
) => ({ generationGroupKey, generationGroupType, supplementNo, allocationId });
