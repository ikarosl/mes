import type {
  ProcessRouteListItem,
  ProcessRouteOption,
  ProcessRoutePayload,
  ProcessRouteQuery,
  ProcessRouteStatus,
  ProcessRouteStepItem,
  ProcessRouteStepPayload,
  PageResult,
} from '@company/contracts';
import type { AuditContext } from '../../../../common/audit/audit.types.js';

export abstract class ProcessRouteRepository {
  abstract listRoutes(query: ProcessRouteQuery): Promise<PageResult<ProcessRouteListItem>>;
  abstract listRouteOptions(): Promise<ProcessRouteOption[]>;
  abstract createRoute(payload: ProcessRoutePayload, audit: AuditContext): Promise<{ id: string }>;
  abstract updateRoute(
    id: string,
    payload: ProcessRoutePayload,
    audit: AuditContext,
  ): Promise<void>;
  abstract setRouteStatus(
    id: string,
    status: ProcessRouteStatus,
    audit: AuditContext,
  ): Promise<void>;
  abstract deleteRoute(id: string, audit: AuditContext): Promise<void>;
  abstract listRouteSteps(routeId: string): Promise<ProcessRouteStepItem[]>;
  abstract replaceRouteSteps(
    routeId: string,
    items: ProcessRouteStepPayload[],
    audit: AuditContext,
  ): Promise<void>;
}
