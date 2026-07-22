import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { AuditContext } from '../../application/audit.types.js';
import { RbacService } from '../../application/rbac.service.js';
import { AuditInApplication, CurrentAuditContext, RequirePermission } from './auth.decorators.js';
import {
  AssignRolePermissionsDto,
  AssignUserRolesDto,
  CreateRoleDto,
  CreateUserDto,
  IdParamDto,
  OperationLogQueryDto,
  ResetUserPasswordDto,
  UpdateRoleDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/rbac.dto.js';

@Controller('system')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}
  @Get('users') @RequirePermission(PERMISSIONS.system.users.view) users() {
    return this.rbac.listUsers();
  }
  @Post('users')
  @RequirePermission(PERMISSIONS.system.users.create)
  @AuditInApplication()
  createUser(@Body() body: CreateUserDto, @CurrentAuditContext() audit: AuditContext) {
    return this.rbac.createUser(body, audit);
  }
  @Get('departments/options')
  @RequirePermission(PERMISSIONS.system.users.view)
  departmentOptions() {
    return this.rbac.listDepartmentOptions();
  }
  @Get('roles/options')
  @RequirePermission(PERMISSIONS.system.users.view)
  roleOptions() {
    return this.rbac.listRoleOptions();
  }
  @Patch('users/:id')
  @RequirePermission(PERMISSIONS.system.users.update)
  @AuditInApplication()
  updateUser(
    @Param() { id }: IdParamDto,
    @Body() body: UpdateUserDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.rbac.updateUser(id, body, audit);
  }
  @Patch('users/:id/status')
  @RequirePermission(PERMISSIONS.system.users.update)
  @AuditInApplication()
  setUserStatus(
    @Param() { id }: IdParamDto,
    @Body() body: UpdateUserStatusDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.rbac.setUserStatus(id, body.status, audit);
  }
  @Patch('users/:id/password')
  @RequirePermission(PERMISSIONS.system.users.resetPassword)
  @AuditInApplication()
  resetUserPassword(
    @Param() { id }: IdParamDto,
    @Body() body: ResetUserPasswordDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.rbac.resetUserPassword(id, body.password, audit);
  }
  @Put('users/:id/roles')
  @RequirePermission(PERMISSIONS.system.users.assignRoles)
  @AuditInApplication()
  setUserRoles(
    @Param() { id }: IdParamDto,
    @Body() body: AssignUserRolesDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.rbac.setUserRoles(id, body.roleIds, audit);
  }
  @Get('roles') @RequirePermission(PERMISSIONS.system.roles.view) roles() {
    return this.rbac.listRoles();
  }
  @Post('roles')
  @RequirePermission(PERMISSIONS.system.roles.create)
  @AuditInApplication()
  createRole(@Body() body: CreateRoleDto, @CurrentAuditContext() audit: AuditContext) {
    return this.rbac.createRole(body, audit);
  }
  @Patch('roles/:id')
  @RequirePermission(PERMISSIONS.system.roles.update)
  @AuditInApplication()
  updateRole(
    @Param() { id }: IdParamDto,
    @Body() body: UpdateRoleDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.rbac.updateRole(id, body, audit);
  }
  @Delete('roles/:id')
  @RequirePermission(PERMISSIONS.system.roles.delete)
  @AuditInApplication()
  deleteRole(@Param() { id }: IdParamDto, @CurrentAuditContext() audit: AuditContext) {
    return this.rbac.deleteRole(id, audit);
  }
  @Get('roles/:id/permissions')
  @RequirePermission(PERMISSIONS.system.roles.assignPermissions)
  rolePermissions(@Param() { id }: IdParamDto) {
    return this.rbac.getRolePermissions(id);
  }
  @Put('roles/:id/permissions')
  @RequirePermission(PERMISSIONS.system.roles.assignPermissions)
  @AuditInApplication()
  setRolePermissions(
    @Param() { id }: IdParamDto,
    @Body() body: AssignRolePermissionsDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.rbac.setRolePermissions(id, body.permissionIds, audit);
  }
  @Get('permissions') @RequirePermission(PERMISSIONS.system.permissions.view) permissions() {
    return this.rbac.listPermissions();
  }
  @Get('logs') @RequirePermission(PERMISSIONS.system.logs.view) logs(
    @Query() query: OperationLogQueryDto,
  ) {
    return this.rbac.listLogs({
      ...query,
      page: query.page ? Math.max(Number(query.page), 1) : undefined,
      pageSize: query.pageSize ? Math.min(Math.max(Number(query.pageSize), 1), 100) : undefined,
    });
  }
}
