import { Injectable } from '@nestjs/common';
import type {
  ApprovalActorEligibility,
  ApprovalRoleOption,
  SystemRoleOption,
  UserOption,
} from '@company/contracts';
import { RbacRepository } from './ports/rbac.repository.js';

@Injectable()
export class IdentityDirectoryService {
  constructor(private readonly repository: RbacRepository) {}

  listActiveUserOptions(): Promise<UserOption[]> {
    return this.repository.listActiveUserOptions();
  }

  listActiveUserOptionsByIds(ids: string[]): Promise<UserOption[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.repository.listActiveUserOptionsByIds(ids);
  }

  /** 解析持久化引用的显示数据，包括已停用或软删除的用户。 */
  listUserReferencesByIds(ids: string[]): Promise<UserOption[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.repository.listUserReferencesByIds(ids);
  }

  listApprovalRoleOptions(): Promise<ApprovalRoleOption[]> {
    return this.repository.listApprovalRoleOptions();
  }

  /** 仅供历史显示，保留停用、软删除角色的名称；不能作为审批资格。 */
  listRoleReferencesByIds(ids: string[]): Promise<SystemRoleOption[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.repository.listRoleReferencesByIds(ids);
  }

  listApprovalEligibleUserIds(roleId?: string): Promise<string[]> {
    return this.repository.listApprovalEligibleUserIds(roleId);
  }

  getApprovalActorEligibility(userId: string): Promise<ApprovalActorEligibility> {
    return this.repository.getApprovalActorEligibility(userId);
  }

  async listApprovalUserOptions(): Promise<UserOption[]> {
    const ids = await this.repository.listApprovalEligibleUserIds();
    return this.listUserReferencesByIds(ids);
  }
}
