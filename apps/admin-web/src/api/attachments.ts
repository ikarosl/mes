import {
  ATTACHMENT_API,
  type AttachmentListItem,
  type AttachmentQuery,
  type AttachmentReferenceItem,
  type AttachmentLifecyclePayload,
  type AttachmentLifecycleResult,
  type PageQuery,
  type PageResult,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: RetryRequestConfig): Promise<T> => {
  const localConfig: RetryRequestConfig = { ...config, skipErrorHandling: true };
  try {
    return (await httpClient.request<T>(localConfig)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

export const attachmentsApi = {
  list: (params: AttachmentQuery, signal?: AbortSignal) =>
    request<PageResult<AttachmentListItem>>({ url: ATTACHMENT_API.list, params, signal }),
  references: (id: string, params: PageQuery, signal?: AbortSignal) =>
    request<PageResult<AttachmentReferenceItem>>({
      url: ATTACHMENT_API.references(id),
      params,
      signal,
    }),
  content: (id: string, signal?: AbortSignal) =>
    request<Blob>({ url: ATTACHMENT_API.content(id), responseType: 'blob', timeout: 0, signal }),
  trash: (id: string, data: AttachmentLifecyclePayload) =>
    request<AttachmentLifecycleResult>({
      url: ATTACHMENT_API.trash(id),
      method: 'POST',
      data,
      skipRetry: true,
    }),
  purge: (id: string, data: AttachmentLifecyclePayload) =>
    request<AttachmentLifecycleResult>({
      url: ATTACHMENT_API.purge(id),
      method: 'POST',
      data,
      skipRetry: true,
    }),
};
