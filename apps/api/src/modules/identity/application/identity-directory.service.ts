import { Injectable } from '@nestjs/common';
import type { UserOption } from '@company/contracts';
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
}
