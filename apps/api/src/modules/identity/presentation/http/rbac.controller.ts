import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PERMISSIONS } from '@company/constants';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { RbacService } from '../../application/rbac.service.js';
import type { RbacWriteResult } from '../../application/ports/rbac.repository.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import {
  AssignRolePermissionsDto,
  AssignUserRolesDto,
  CreateRoleDto,
  CreateUserDto,
  IdParamDto,
  OperationLogQueryDto,
  ResetUserPasswordDto,
  SystemRoleQueryDto,
  SystemUserQueryDto,
  UpdateRoleDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/rbac.dto.js';

@Controller('system')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}
  @Get('users') @RequirePermission(PERMISSIONS.system.users.view) users(
    @Query() query: SystemUserQueryDto,
  ) {
    return this.rbac.listUsers({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      username: query.username?.trim() || undefined,
      displayName: query.displayName?.trim() || undefined,
      roleId: query.roleId,
      status: query.status,
    });
  }
  @Post('users')
  @RequirePermission(PERMISSIONS.system.users.create)
  @AuditInApplication()
  async createUser(@Body() body: CreateUserDto, @CurrentCommandContext() audit: CommandContext) {
    const result = await this.rbac.createUser(body, audit);
    return { id: this.writeResult(result, '用户不存在') };
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
  async updateUser(
    @Param() { id }: IdParamDto,
    @Body() body: UpdateUserDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    this.writeResult(await this.rbac.updateUser(id, body, audit), '用户不存在');
  }
  @Patch('users/:id/status')
  @RequirePermission(PERMISSIONS.system.users.update)
  @AuditInApplication()
  async setUserStatus(
    @Param() { id }: IdParamDto,
    @Body() body: UpdateUserStatusDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    this.writeResult(await this.rbac.setUserStatus(id, body.status, audit), '用户不存在');
  }
  @Patch('users/:id/password')
  @RequirePermission(PERMISSIONS.system.users.resetPassword)
  @AuditInApplication()
  async resetUserPassword(
    @Param() { id }: IdParamDto,
    @Body() body: ResetUserPasswordDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    this.writeResult(await this.rbac.resetUserPassword(id, body.password, audit), '用户不存在');
  }
  @Put('users/:id/roles')
  @RequirePermission(PERMISSIONS.system.users.assignRoles)
  @AuditInApplication()
  async setUserRoles(
    @Param() { id }: IdParamDto,
    @Body() body: AssignUserRolesDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    this.writeResult(await this.rbac.setUserRoles(id, body.roleIds, audit), '用户不存在');
  }
  @Get('roles') @RequirePermission(PERMISSIONS.system.roles.view) roles(
    @Query() query: SystemRoleQueryDto,
  ) {
    return this.rbac.listRoles({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      name: query.name?.trim() || undefined,
      code: query.code?.trim() || undefined,
      status: query.status,
    });
  }
  @Post('roles')
  @RequirePermission(PERMISSIONS.system.roles.create)
  @AuditInApplication()
  async createRole(@Body() body: CreateRoleDto, @CurrentCommandContext() audit: CommandContext) {
    const result = await this.rbac.createRole(body, audit);
    return { id: this.writeResult(result, '角色不存在') };
  }
  @Patch('roles/:id')
  @RequirePermission(PERMISSIONS.system.roles.update)
  @AuditInApplication()
  async updateRole(
    @Param() { id }: IdParamDto,
    @Body() body: UpdateRoleDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    this.writeResult(await this.rbac.updateRole(id, body, audit), '角色不存在');
  }
  @Delete('roles/:id')
  @RequirePermission(PERMISSIONS.system.roles.delete)
  @AuditInApplication()
  async deleteRole(@Param() { id }: IdParamDto, @CurrentCommandContext() audit: CommandContext) {
    this.writeResult(await this.rbac.deleteRole(id, audit), '角色不存在');
  }
  @Get('roles/:id/permissions')
  @RequirePermission(PERMISSIONS.system.roles.assignPermissions)
  async rolePermissions(@Param() { id }: IdParamDto) {
    const permissionIds = await this.rbac.getRolePermissions(id);
    if (permissionIds === null) throw new NotFoundException('角色不存在');
    return { roleId: id, permissionIds };
  }
  @Put('roles/:id/permissions')
  @RequirePermission(PERMISSIONS.system.roles.assignPermissions)
  @AuditInApplication()
  async setRolePermissions(
    @Param() { id }: IdParamDto,
    @Body() body: AssignRolePermissionsDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    this.writeResult(
      await this.rbac.setRolePermissions(id, body.permissionIds, audit),
      '角色不存在',
    );
  }
  @Get('permissions') @RequirePermission(PERMISSIONS.system.permissions.view) permissions() {
    return this.rbac.listPermissions();
  }
  @Get('logs') @RequirePermission(PERMISSIONS.system.logs.view) logs(
    @Query() query: OperationLogQueryDto,
  ) {
    return this.rbac.listLogs({
      ...query,
      keyword: query.keyword?.trim() || undefined,
    });
  }
  /** presentation 层把协议无关的写结果映射为 HTTP 状态与错误信封。 */
  private writeResult<T>(result: RbacWriteResult<T>, notFoundMessage: string): T {
    if (result.status === 'success') return result.value;
    if (result.status === 'not-found') throw new NotFoundException(notFoundMessage);
    if (result.status === 'invalid-input') throw new BadRequestException(result.message);
    if (result.status === 'invalid-reference') throw new BadRequestException(result.message);
    throw new ConflictException(result.message);
  }
}
