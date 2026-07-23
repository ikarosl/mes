import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { OPERATION_RESULTS, SYSTEM_STATUS } from '@company/constants';
import type { OperationResult } from '@company/contracts';

export class IdParamDto {
  @IsNumberString({ no_symbols: true }, { message: '资源 ID 格式无效' })
  id!: string;
}

export class CreateUserDto {
  @IsString({ message: '用户名必须是字符串' })
  @Length(1, 64, { message: '用户名长度必须在 1 到 64 个字符之间' })
  username!: string;

  @IsString({ message: '密码必须是字符串' })
  @Length(12, 128, { message: '密码长度必须在 12 到 128 个字符之间' })
  password!: string;

  @IsString({ message: '姓名必须是字符串' })
  @Length(1, 64, { message: '姓名长度必须在 1 到 64 个字符之间' })
  displayName!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsNumberString({ no_symbols: true }, { message: '部门 ID 格式无效' })
  departmentId?: string | null;

  @IsArray({ message: '角色 ID 必须是数组' })
  @ArrayMaxSize(50, { message: '单个用户最多分配 50 个角色' })
  @ArrayUnique({ message: '角色 ID 不能重复' })
  @IsNumberString({ no_symbols: true }, { each: true, message: '角色 ID 格式无效' })
  roleIds!: string[];

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsEmail({}, { message: '邮箱格式无效' })
  @MaxLength(128, { message: '邮箱最多 128 个字符' })
  email?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsString({ message: '手机号必须是字符串' })
  @MaxLength(32, { message: '手机号最多 32 个字符' })
  mobile?: string | null;

  @IsOptional()
  @IsInt({ message: '状态必须是整数' })
  @IsIn([SYSTEM_STATUS.disabled, SYSTEM_STATUS.enabled], { message: '状态只能是 0 或 1' })
  status?: number;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @Length(1, 64) username?: string;
  @IsOptional() @IsString() @Length(1, 64) displayName?: string;
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsNumberString({ no_symbols: true }, { message: '部门 ID 格式无效' })
  departmentId?: string | null;
  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsEmail({}, { message: '邮箱格式无效' })
  @MaxLength(128)
  email?: string | null;
  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsString()
  @MaxLength(32)
  mobile?: string | null;
}

export class ResetUserPasswordDto {
  @IsString({ message: '密码必须是字符串' })
  @Length(12, 128, { message: '密码长度必须在 12 到 128 个字符之间' })
  password!: string;
}

export class UpdateUserStatusDto {
  @IsInt({ message: '状态必须是整数' })
  @IsIn([SYSTEM_STATUS.disabled, SYSTEM_STATUS.enabled], { message: '状态只能是 0 或 1' })
  status!: number;
}

export class AssignUserRolesDto {
  @IsArray({ message: '角色 ID 必须是数组' })
  @ArrayMaxSize(50, { message: '单个用户最多分配 50 个角色' })
  @ArrayUnique({ message: '角色 ID 不能重复' })
  @IsNumberString({ no_symbols: true }, { each: true, message: '角色 ID 格式无效' })
  roleIds!: string[];
}

export class CreateRoleDto {
  @IsString({ message: '角色名称必须是字符串' })
  @Length(1, 64, { message: '角色名称长度必须在 1 到 64 个字符之间' })
  name!: string;

  @IsString({ message: '角色编码必须是字符串' })
  @Length(1, 64, { message: '角色编码长度必须在 1 到 64 个字符之间' })
  code!: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString({ message: '角色说明必须是字符串' })
  @MaxLength(255, { message: '角色说明最多 255 个字符' })
  description?: string | null;

  @IsOptional()
  @IsInt({ message: '状态必须是整数' })
  @IsIn([SYSTEM_STATUS.disabled, SYSTEM_STATUS.enabled], { message: '状态只能是 0 或 1' })
  status?: number;
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @Length(1, 64) name?: string;
  @IsOptional() @IsString() @Length(1, 64) code?: string;
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(255)
  description?: string | null;
  @IsOptional()
  @IsInt()
  @IsIn([SYSTEM_STATUS.disabled, SYSTEM_STATUS.enabled])
  status?: number;
}

export class AssignRolePermissionsDto {
  @IsArray({ message: '权限 ID 必须是数组' })
  @ArrayMaxSize(200, { message: '单个角色最多分配 200 个权限' })
  @ArrayUnique({ message: '权限 ID 不能重复' })
  @IsNumberString({ no_symbols: true }, { each: true, message: '权限 ID 格式无效' })
  permissionIds!: string[];
}

export class OperationLogQueryDto {
  @IsOptional() @IsNumberString({ no_symbols: true }) page?: string;
  @IsOptional() @IsNumberString({ no_symbols: true }) pageSize?: string;
  @IsOptional() @IsString() @MaxLength(128) keyword?: string;
  @IsOptional() @IsString() @MaxLength(32) logType?: string;
  @IsOptional() @IsString() @MaxLength(64) module?: string;
  @IsOptional() @IsIn(OPERATION_RESULTS) result?: OperationResult;
  @IsOptional() @IsNumberString({ no_symbols: true }) userId?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9_-]{1,128}$/) requestId?: string;
  @IsOptional() @IsString() @MaxLength(64) targetType?: string;
  @IsOptional() @IsNumberString({ no_symbols: true }) targetId?: string;
  @IsOptional() @IsDateString() createdAtFrom?: string;
  @IsOptional() @IsDateString() createdAtTo?: string;
}
