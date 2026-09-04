import type {
  MaterialDemandManagementPage,
  MaterialDemandManagementQuery,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type { NormalDemandVariantSplit } from '../../domain/production-material-requirement.policy.js';

/**
 * Command boundary for administrator-confirmed material requirements.
 *
 * The repository transaction locks the production batch and current BOM, creates
 * one immutable basis per confirmed BOM line, and creates exact-variant demand
 * facts. A basis without its complete normal split must never be committed.
 * Configuration is intentionally row-by-row: an already confirmed BOM line is
 * immutable, while the batch remains `pending` until every BOM line is confirmed.
 * Stock quantities shown during selection are advisory and never auto-select a row.
 */
export interface ConfigureMaterialRequirementCommand {
  productMaterialId: string;
  splits: NormalDemandVariantSplit[];
}

export interface AddManualMaterialDemandCommand {
  parentDemandId: string;
  materialVariantId: string;
  quantity: number;
  reason: string;
}

export abstract class ProductionMaterialDemandConfigurationRepository {
  abstract listManagement(
    query: MaterialDemandManagementQuery,
  ): Promise<MaterialDemandManagementPage>;
  abstract configureNormalDemands(
    productionBatchId: string,
    requirements: ConfigureMaterialRequirementCommand[],
    context: CommandContext,
  ): Promise<void>;
  abstract addManualDemand(
    command: AddManualMaterialDemandCommand,
    context: CommandContext,
  ): Promise<{ demandId: string }>;
}
