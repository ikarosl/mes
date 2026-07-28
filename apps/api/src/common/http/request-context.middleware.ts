import { randomUUID } from 'node:crypto';
export const REQUEST_ID_HEADER = 'x-request-id';
export const isRequestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);

export interface RequestContextRequest {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}
export interface RequestContextResponse {
  setHeader(name: string, value: string): void;
}
export type NextFunction = () => void;

export const requestContextMiddleware = (
  request: RequestContextRequest,
  response: RequestContextResponse,
  next: NextFunction,
) => {
  const header = request.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(header) ? header[0] : header;
  const requestId = isRequestId(candidate) ? candidate : randomUUID();
  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
};
