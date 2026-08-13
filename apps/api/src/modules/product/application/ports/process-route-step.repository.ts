import type { ProcessRouteStepItem, ProcessRouteStepPayload } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProcessRouteStepRepository {
  abstract listRouteSteps(routeId: string): Promise<ProcessRouteStepItem[]>;
  abstract replaceRouteSteps(
    routeId: string,
    items: ProcessRouteStepPayload[],
    audit: CommandContext,
  ): Promise<void>;
}
