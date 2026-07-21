import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
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
  @Get('logs') @RequirePermission(PERMISSIONS.system.logs.view) logs() {
    return this.rbac.listLogs();
  }
}
