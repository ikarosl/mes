import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

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
}

export class UpdateUserStatusDto {
  @IsInt({ message: '状态必须是整数' })
  @IsIn([0, 1], { message: '状态只能是 0 或 1' })
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
}

export class AssignRolePermissionsDto {
  @IsArray({ message: '权限 ID 必须是数组' })
  @ArrayMaxSize(200, { message: '单个角色最多分配 200 个权限' })
  @ArrayUnique({ message: '权限 ID 不能重复' })
  @IsNumberString({ no_symbols: true }, { each: true, message: '权限 ID 格式无效' })
  permissionIds!: string[];
}
