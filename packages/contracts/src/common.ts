export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorResponse {
  status: number;
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
  path: string;
  details?: Record<string, unknown>;
}

export interface VersionedCommand {
  version: number;
}

export interface ReasonedVersionedCommand extends VersionedCommand {
  reason: string;
}

export type PermissionType = 'menu' | 'page' | 'button' | 'api';

export type OperationResult = 'success' | 'failed';
