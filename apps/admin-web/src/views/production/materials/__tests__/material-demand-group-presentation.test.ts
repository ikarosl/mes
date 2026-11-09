import { describe, expect, it } from 'vitest';
import type { DemandGenerationGroupType } from '@company/contracts';
import { groupMaterialDemandRows } from '../material-demand-group-presentation';

describe('material demand group presentation', () => {
  it('keeps generation order and groups allocation rows without aggregating their facts', () => {
    const rows = [row('NORMAL:8', 'normal', null, 'a1'), row('NORMAL:8', 'normal', null, 'a2')];

    const groups = groupMaterialDemandRows(rows);

    expect(groups.map((group) => group.label)).toEqual(['初始物料需求']);
    expect(groups[0]?.rows.map((item) => item.allocationId)).toEqual(['a1', 'a2']);
  });
});

const row = (
  generationGroupKey: string,
  generationGroupType: DemandGenerationGroupType,
  manualAdditionNo: string | null,
  allocationId: string,
) => ({ generationGroupKey, generationGroupType, manualAdditionNo, allocationId });
