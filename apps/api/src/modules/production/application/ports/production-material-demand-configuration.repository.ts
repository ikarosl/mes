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
 * Configuration must contain the complete frozen BOM and is committed atomically.
 * Inventory is outside this management projection and is not queried during
 * demand configuration.
 */
export interface ConfigureMaterialRequirementCommand {
  productMaterialId: string;
  splits: NormalDemandVariantSplit[];
}

export interface AddManualMaterialDemandCommand {
  productionBatchId: string;
  requirements: ConfigureMaterialRequirementCommand[];
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
  ): Promise<{ additionId: string; additionNo: string; demandIds: string[] }>;
}
