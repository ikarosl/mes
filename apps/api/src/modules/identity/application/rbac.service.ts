import { BadRequestException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { CreateRoleRequest, CreateUserRequest } from '@company/contracts';
import { IdentityRepository } from './ports/identity.repository.js';

@Injectable()
export class RbacService {
  constructor(private readonly repository: IdentityRepository) {}
  listUsers() {
    return this.repository.listUsers();
  }
  async createUser(payload: CreateUserRequest) {
    if (!payload.username.trim() || !payload.displayName.trim() || payload.password.length < 12)
      throw new BadRequestException('用户名、姓名必填，密码至少 12 位');
    return {
      id: await this.repository.createUser(payload, await bcrypt.hash(payload.password, 12)),
    };
  }
  setUserStatus(id: string, status: number) {
    if (![0, 1].includes(status)) throw new BadRequestException('状态无效');
    return this.repository.setUserStatus(id, status);
  }
  setUserRoles(id: string, roleIds: string[]) {
    return this.repository.setUserRoles(id, roleIds);
  }
  listRoles() {
    return this.repository.listRoles();
  }
  async createRole(payload: CreateRoleRequest) {
    if (!payload.name.trim() || !payload.code.trim())
      throw new BadRequestException('角色名称和编码必填');
    return { id: await this.repository.createRole(payload) };
  }
  setRolePermissions(id: string, permissionIds: string[]) {
    return this.repository.setRolePermissions(id, permissionIds);
  }
  listPermissions() {
    return this.repository.listPermissions();
  }
  listLogs() {
    return this.repository.listLogs();
  }
}
