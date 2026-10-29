import { DEMAND_GENERATION_GROUP_TYPE_LABELS } from '@company/constants';
import type { DemandGenerationSource } from '@company/contracts';

export type MaterialDemandGroupSource = DemandGenerationSource;

export type MaterialDemandGroup<T> = MaterialDemandGroupSource & {
  label: string;
  rows: T[];
};

export const materialDemandGroupLabel = (source: MaterialDemandGroupSource): string => {
  const label = DEMAND_GENERATION_GROUP_TYPE_LABELS[source.generationGroupType];
  return source.supplementNo ? `${label} ${source.supplementNo}` : label;
};

export const groupMaterialDemandRows = <T extends MaterialDemandGroupSource>(
  rows: readonly T[],
): MaterialDemandGroup<T>[] => {
  const groups = new Map<string, MaterialDemandGroup<T>>();
  for (const row of rows) {
    const existing = groups.get(row.generationGroupKey);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(row.generationGroupKey, {
      generationGroupKey: row.generationGroupKey,
      generationGroupType: row.generationGroupType,
      supplementNo: row.supplementNo,
      label: materialDemandGroupLabel(row),
      rows: [row],
    });
  }
  return [...groups.values()];
};
