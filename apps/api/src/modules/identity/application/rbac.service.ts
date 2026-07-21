import { BadRequestException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { CreateRoleRequest, CreateUserRequest } from '@company/contracts';
import type { AuditContext, AuditLogEntry } from './audit.types.js';
import { AuditRepository } from './ports/audit.repository.js';
import { IdentityRepository } from './ports/identity.repository.js';

@Injectable()
export class RbacService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly auditRepository: AuditRepository,
  ) {}
  listUsers() {
    return this.repository.listUsers();
  }
  async createUser(payload: CreateUserRequest, context: AuditContext) {
    if (!payload.username.trim() || !payload.displayName.trim() || payload.password.length < 12)
      throw new BadRequestException('用户名、姓名必填，密码至少 12 位');
    return {
      id: await this.repository.createUser(
        payload,
        await bcrypt.hash(payload.password, 12),
        this.audit('创建用户', context),
      ),
    };
  }
  setUserStatus(id: string, status: number, context: AuditContext) {
    if (![0, 1].includes(status)) throw new BadRequestException('状态无效');
    return this.repository.setUserStatus(id, status, this.audit('更新用户状态', context));
  }
  setUserRoles(id: string, roleIds: string[], context: AuditContext) {
    return this.repository.setUserRoles(id, roleIds, this.audit('分配用户角色', context));
  }
  listRoles() {
    return this.repository.listRoles();
  }
  async createRole(payload: CreateRoleRequest, context: AuditContext) {
    if (!payload.name.trim() || !payload.code.trim())
      throw new BadRequestException('角色名称和编码必填');
    return { id: await this.repository.createRole(payload, this.audit('创建角色', context)) };
  }
  setRolePermissions(id: string, permissionIds: string[], context: AuditContext) {
    return this.repository.setRolePermissions(
      id,
      permissionIds,
      this.audit('分配角色权限', context),
    );
  }
  listPermissions() {
    return this.repository.listPermissions();
  }
  listLogs() {
    return this.auditRepository.listLogs();
  }
  private audit(action: string, context: AuditContext): AuditLogEntry {
    return {
      logType: 'operation',
      module: 'system',
      action,
      userId: context.userId,
      result: 'success',
      ip: context.ip,
    };
  }
}
