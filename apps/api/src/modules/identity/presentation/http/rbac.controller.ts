import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import type { CreateRoleRequest, CreateUserRequest } from '@company/contracts';
import { PERMISSIONS } from '@company/constants';
import { RbacService } from '../../application/rbac.service.js';
import { RequirePermission } from './auth.decorators.js';

@Controller('system')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}
  @Get('users') @RequirePermission(PERMISSIONS.system.users.view) users() {
    return this.rbac.listUsers();
  }
  @Post('users') @RequirePermission(PERMISSIONS.system.users.create) createUser(
    @Body() body: CreateUserRequest,
  ) {
    return this.rbac.createUser({
      ...body,
      roleIds: Array.isArray(body.roleIds) ? body.roleIds : [],
    });
  }
  @Patch('users/:id/status') @RequirePermission(PERMISSIONS.system.users.update) setUserStatus(
    @Param('id') id: string,
    @Body() body: { status: number },
  ) {
    return this.rbac.setUserStatus(id, Number(body.status));
  }
  @Put('users/:id/roles') @RequirePermission(PERMISSIONS.system.users.assignRoles) setUserRoles(
    @Param('id') id: string,
    @Body() body: { roleIds: string[] },
  ) {
    return this.rbac.setUserRoles(id, Array.isArray(body.roleIds) ? body.roleIds : []);
  }
  @Get('roles') @RequirePermission(PERMISSIONS.system.roles.view) roles() {
    return this.rbac.listRoles();
  }
  @Post('roles') @RequirePermission(PERMISSIONS.system.roles.create) createRole(
    @Body() body: CreateRoleRequest,
  ) {
    return this.rbac.createRole(body);
  }
  @Put('roles/:id/permissions')
  @RequirePermission(PERMISSIONS.system.roles.assignPermissions)
  setRolePermissions(@Param('id') id: string, @Body() body: { permissionIds: string[] }) {
    return this.rbac.setRolePermissions(
      id,
      Array.isArray(body.permissionIds) ? body.permissionIds : [],
    );
  }
  @Get('permissions') @RequirePermission(PERMISSIONS.system.permissions.view) permissions() {
    return this.rbac.listPermissions();
  }
  @Get('logs') @RequirePermission(PERMISSIONS.system.logs.view) logs() {
    return this.rbac.listLogs();
  }
}
