import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { SYSTEM_STATUS } from '@company/constants';
import type {
  CreateSystemRolePayload,
  CreateSystemUserPayload,
  OperationLogQuery,
  UpdateSystemRolePayload,
  UpdateSystemUserPayload,
  SystemRoleQuery,
  SystemUserQuery,
} from '@company/contracts';
import type { CommandContext, AuditLogEntry } from '../../../common/audit/audit.types.js';
import { AuditRepository } from './ports/audit.repository.js';
import { RbacRepository, type RbacWriteResult } from './ports/rbac.repository.js';

@Injectable()
export class RbacService {
  constructor(
    private readonly repository: RbacRepository,
    private readonly auditRepository: AuditRepository,
  ) {}
  listUsers(query: SystemUserQuery) {
    return this.repository.listUsers(query);
  }
  listDepartmentOptions() {
    return this.repository.listDepartmentOptions();
  }
  listRoleOptions() {
    return this.repository.listRoleOptions();
  }
  async createUser(
    payload: CreateSystemUserPayload,
    context: CommandContext,
  ): Promise<RbacWriteResult<string>> {
    if (!payload.username.trim() || !payload.displayName.trim() || payload.password.length < 6)
      return { status: 'invalid-input', message: '用户名、姓名必填，密码至少 6 位' };
    return this.repository.createUser(
      payload,
      await bcrypt.hash(payload.password, 12),
      this.audit('创建用户', context),
    );
  }
  updateUser(
    id: string,
    payload: UpdateSystemUserPayload,
    context: CommandContext,
  ): Promise<RbacWriteResult> {
    if (payload.username !== undefined && !payload.username.trim())
      return Promise.resolve({ status: 'invalid-input', message: '用户名不能为空' });
    if (payload.displayName !== undefined && !payload.displayName.trim())
      return Promise.resolve({ status: 'invalid-input', message: '姓名不能为空' });
    return this.repository.updateUser(id, payload, this.audit('更新用户资料', context));
  }
  setUserStatus(id: string, status: number, context: CommandContext): Promise<RbacWriteResult> {
    if (status !== SYSTEM_STATUS.disabled && status !== SYSTEM_STATUS.enabled)
      return Promise.resolve({ status: 'invalid-input', message: '状态无效' });
    return this.repository.setUserStatus(id, status, this.audit('更新用户状态', context));
  }
  async resetUserPassword(
    id: string,
    password: string,
    context: CommandContext,
  ): Promise<RbacWriteResult> {
    if (password.length < 6) return { status: 'invalid-input', message: '密码至少 6 位' };
    return this.repository.resetUserPassword(
      id,
      await bcrypt.hash(password, 12),
      this.audit('重置用户密码', context),
    );
  }
  setUserRoles(id: string, roleIds: string[], context: CommandContext): Promise<RbacWriteResult> {
    return this.repository.setUserRoles(id, roleIds, this.audit('分配用户角色', context));
  }
  listRoles(query: SystemRoleQuery) {
    return this.repository.listRoles(query);
  }
  createRole(
    payload: CreateSystemRolePayload,
    context: CommandContext,
  ): Promise<RbacWriteResult<string>> {
    if (!payload.name.trim() || !payload.code.trim())
      return Promise.resolve({ status: 'invalid-input', message: '角色名称和编码必填' });
    return this.repository.createRole(payload, this.audit('创建角色', context));
  }
  updateRole(
    id: string,
    payload: UpdateSystemRolePayload,
    context: CommandContext,
  ): Promise<RbacWriteResult> {
    if (payload.name !== undefined && !payload.name.trim())
      return Promise.resolve({ status: 'invalid-input', message: '角色名称不能为空' });
    if (payload.code !== undefined && !payload.code.trim())
      return Promise.resolve({ status: 'invalid-input', message: '角色编码不能为空' });
    return this.repository.updateRole(id, payload, this.audit('更新角色', context));
  }
  deleteRole(id: string, context: CommandContext): Promise<RbacWriteResult> {
    return this.repository.deleteRole(id, this.audit('删除角色', context));
  }
  getRolePermissions(id: string) {
    return this.repository.getRolePermissionIds(id);
  }
  setRolePermissions(
    id: string,
    permissionIds: string[],
    context: CommandContext,
  ): Promise<RbacWriteResult> {
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
  private audit(action: string, context: CommandContext): AuditLogEntry {
    return {
      logType: 'operation',
      module: 'system',
      action,
      userId: context.actorId,
      result: 'success',
      ip: context.ip,
      requestId: context.requestId,
      userAgent: context.userAgent,
    };
  }
}
