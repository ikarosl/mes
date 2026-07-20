import { createRequestClient } from '@company/request';
export const httpClient = createRequestClient({ baseURL: '/api', timeoutMs: 10_000 });
