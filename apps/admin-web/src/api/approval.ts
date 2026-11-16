import type {
  ApprovalFlowDetail,
  ApprovalInstanceDetail,
  ApprovalInstanceListItem,
  ApprovalInstanceQuery,
  ApprovalRoleOption,
  ApprovalSceneItem,
  ApprovalSubmissionResult,
  ApprovalDecisionCommand,
  ApprovalCommentCommand,
  PublishApprovalFlowCommand,
  PageResult,
  SaveApprovalFlowDraft,
  SetApprovalFlowEnabledCommand,
  UserOption,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

interface ReadRequestOptions {
  signal?: AbortSignal;
  skipErrorHandling?: boolean;
}

const request = async <T>(config: RetryRequestConfig) => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

const base = '/approval';

/**
 * Approval HTTP contract. The page layer owns loading and refresh behavior;
 * this module only translates stable URLs and DTOs.
 */
export const approvalApi = {
  scenes: (options: ReadRequestOptions = {}) =>
    request<ApprovalSceneItem[]>({ url: `${base}/scenes`, ...options }),
  roleOptions: (options: ReadRequestOptions = {}) =>
    request<ApprovalRoleOption[]>({
      url: `${base}/role-options`,
      skipErrorHandling: true,
      ...options,
    }),
  userOptions: (options: ReadRequestOptions = {}) =>
    request<UserOption[]>({ url: `${base}/user-options`, skipErrorHandling: true, ...options }),
  flow: (sceneCode: string, options: ReadRequestOptions = {}) =>
    request<ApprovalFlowDetail>({
      url: `${base}/scenes/${encodeURIComponent(sceneCode)}/flow`,
      ...options,
    }),
  setFlowEnabled: (sceneCode: string, data: SetApprovalFlowEnabledCommand) =>
    request<ApprovalFlowDetail>({
      url: `${base}/scenes/${encodeURIComponent(sceneCode)}/flow/enabled`,
      method: 'PUT',
      data,
    }),
  saveFlowDraft: (sceneCode: string, data: SaveApprovalFlowDraft) =>
    request<ApprovalFlowDetail>({
      url: `${base}/scenes/${encodeURIComponent(sceneCode)}/flow/draft`,
      method: 'PUT',
      data,
    }),
  publishFlow: (sceneCode: string, data: PublishApprovalFlowCommand) =>
    request<ApprovalFlowDetail>({
      url: `${base}/scenes/${encodeURIComponent(sceneCode)}/flow/publish`,
      method: 'POST',
      data,
    }),
  instances: (params: ApprovalInstanceQuery) =>
    request<PageResult<ApprovalInstanceListItem>>({ url: `${base}/instances`, params }),
  instance: (id: string) => request<ApprovalInstanceDetail>({ url: `${base}/instances/${id}` }),
  approve: (id: string, data: ApprovalDecisionCommand) =>
    request<ApprovalInstanceDetail>({
      url: `${base}/instances/${id}/approve`,
      method: 'POST',
      data,
    }),
  reject: (id: string, data: ApprovalDecisionCommand) =>
    request<ApprovalInstanceDetail>({
      url: `${base}/instances/${id}/reject`,
      method: 'POST',
      data,
    }),
  withdraw: (id: string, data: ApprovalCommentCommand) =>
    request<ApprovalInstanceDetail>({
      url: `${base}/instances/${id}/withdraw`,
      method: 'POST',
      data,
    }),
  submitBom: (productId: string, version: number) =>
    request<ApprovalSubmissionResult>({
      url: `${base}/bom/${productId}/submit`,
      method: 'POST',
      data: { version },
    }),
};
