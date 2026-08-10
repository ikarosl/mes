import type {
  ProcessRouteListItem,
  ProcessRouteOption,
  ProcessRoutePayload,
  ProcessRouteQuery,
  ProcessRouteStatus,
  PageResult,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';

export abstract class ProcessRouteRepository {
  abstract listRoutes(query: ProcessRouteQuery): Promise<PageResult<ProcessRouteListItem>>;
  abstract listRouteOptions(): Promise<ProcessRouteOption[]>;
  abstract createRoute(
    payload: ProcessRoutePayload,
    audit: CommandContext,
  ): Promise<{ id: string }>;
  abstract updateRoute(
    id: string,
    payload: ProcessRoutePayload,
    audit: CommandContext,
  ): Promise<void>;
  abstract setRouteStatus(
    id: string,
    status: ProcessRouteStatus,
    audit: CommandContext,
  ): Promise<void>;
  abstract deleteRoute(id: string, audit: CommandContext): Promise<void>;
}
