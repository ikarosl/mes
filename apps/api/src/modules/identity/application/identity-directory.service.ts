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

  /** Resolve display data for persisted references, including disabled or soft-deleted users. */
  listUserReferencesByIds(ids: string[]): Promise<UserOption[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.repository.listUserReferencesByIds(ids);
  }
}
