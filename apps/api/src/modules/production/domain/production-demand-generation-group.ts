import { DEMAND_GENERATION_GROUP_TYPE } from '@company/constants';
import type { DemandGenerationGroupType } from '@company/contracts';

type BusinessId = string | number | bigint;

export type DemandGenerationGroupSource =
  | {
      type: typeof DEMAND_GENERATION_GROUP_TYPE.normal;
      productionBatchId: BusinessId;
    }
  | {
      type: typeof DEMAND_GENERATION_GROUP_TYPE.scrapSupplement;
      supplementId: BusinessId;
    }
  | {
      type: typeof DEMAND_GENERATION_GROUP_TYPE.materialLossSupplement;
      supplementId: BusinessId;
    }
  | {
      type: typeof DEMAND_GENERATION_GROUP_TYPE.manualAdditional;
      productionBatchId: BusinessId;
      businessActionNo: string;
    };

const GROUP_KEY_PREFIX: Record<DemandGenerationGroupType, string> = {
  normal: 'NORMAL',
  manual_additional: 'ADDITIONAL',
  scrap_supplement: 'SCRAPSUP',
  material_loss_supplement: 'LOSSSUP',
};

export const buildDemandGenerationGroupKey = (source: DemandGenerationGroupSource): string => {
  const prefix = GROUP_KEY_PREFIX[source.type];
  switch (source.type) {
    case DEMAND_GENERATION_GROUP_TYPE.normal:
      return `${prefix}:${source.productionBatchId}`;
    case DEMAND_GENERATION_GROUP_TYPE.scrapSupplement:
    case DEMAND_GENERATION_GROUP_TYPE.materialLossSupplement:
      return `${prefix}:${source.supplementId}`;
    case DEMAND_GENERATION_GROUP_TYPE.manualAdditional:
      return `${prefix}:${source.productionBatchId}:${source.businessActionNo}`;
  }
};

export const buildDemandGenerationKeys = (
  source: DemandGenerationGroupSource,
  demandIdentityId: BusinessId,
): { generationGroupKey: string; idempotencyKey: string } => {
  const generationGroupKey = buildDemandGenerationGroupKey(source);
  return {
    generationGroupKey,
    idempotencyKey: `${generationGroupKey}:${demandIdentityId}`,
  };
};
