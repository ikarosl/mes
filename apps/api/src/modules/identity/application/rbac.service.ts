import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { SYSTEM_STATUS } from '@company/constants';
import type {
  CreateSystemRolePayload,
  CreateSystemUserPayload,
  OperationLogQuery,
  UpdateSystemRolePayload,
  UpdateSystemUserPayload,
} from '@company/contracts';
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
  listDepartmentOptions() {
    return this.repository.listDepartmentOptions();
  }
  listRoleOptions() {
    return this.repository.listRoleOptions();
  }
  async createUser(payload: CreateSystemUserPayload, context: AuditContext) {
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
  async updateUser(id: string, payload: UpdateSystemUserPayload, context: AuditContext) {
    if (payload.username !== undefined && !payload.username.trim())
      throw new BadRequestException('用户名不能为空');
    if (payload.displayName !== undefined && !payload.displayName.trim())
      throw new BadRequestException('姓名不能为空');
    if (!(await this.repository.updateUser(id, payload, this.audit('更新用户资料', context))))
      throw new NotFoundException('用户不存在');
  }
  setUserStatus(id: string, status: number, context: AuditContext) {
    if (status !== SYSTEM_STATUS.disabled && status !== SYSTEM_STATUS.enabled)
      throw new BadRequestException('状态无效');
    return this.repository.setUserStatus(id, status, this.audit('更新用户状态', context));
  }
  async resetUserPassword(id: string, password: string, context: AuditContext) {
    if (password.length < 12) throw new BadRequestException('密码至少 12 位');
    const found = await this.repository.resetUserPassword(
      id,
      await bcrypt.hash(password, 12),
      this.audit('重置用户密码', context),
    );
    if (!found) throw new NotFoundException('用户不存在');
  }
  setUserRoles(id: string, roleIds: string[], context: AuditContext) {
    return this.repository.setUserRoles(id, roleIds, this.audit('分配用户角色', context));
  }
  listRoles() {
    return this.repository.listRoles();
  }
  async createRole(payload: CreateSystemRolePayload, context: AuditContext) {
    if (!payload.name.trim() || !payload.code.trim())
      throw new BadRequestException('角色名称和编码必填');
    return { id: await this.repository.createRole(payload, this.audit('创建角色', context)) };
  }
  async updateRole(id: string, payload: UpdateSystemRolePayload, context: AuditContext) {
    if (payload.name !== undefined && !payload.name.trim())
      throw new BadRequestException('角色名称不能为空');
    if (payload.code !== undefined && !payload.code.trim())
      throw new BadRequestException('角色编码不能为空');
    if (!(await this.repository.updateRole(id, payload, this.audit('更新角色', context))))
      throw new NotFoundException('角色不存在');
  }
  async deleteRole(id: string, context: AuditContext) {
    const result = await this.repository.deleteRole(id, this.audit('删除角色', context));
    if (result === 'not-found') throw new NotFoundException('角色不存在');
    if (result === 'in-use') throw new ConflictException('角色仍有关联用户，不能删除');
  }
  async getRolePermissions(id: string) {
    const permissionIds = await this.repository.getRolePermissionIds(id);
    if (permissionIds === null) throw new NotFoundException('角色不存在');
    return { roleId: id, permissionIds };
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
  listLogs(query: OperationLogQuery) {
    return this.auditRepository.listLogs(query);
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
