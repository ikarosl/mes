import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { USER_CANDIDATE_SCENES } from '@company/constants';
import type { UserCandidateSceneCode } from '@company/contracts';

export class UserCandidateSceneParamDto {
  @IsIn(Object.values(USER_CANDIDATE_SCENES), { message: '业务人员场景不存在' })
  sceneCode!: UserCandidateSceneCode;
}

export class UpdateUserCandidateConfigDto {
  @ValidateIf((_object, value) => value !== null)
  @IsInt({ message: '配置版本必须是整数或 null' })
  @Min(0, { message: '配置版本不能小于 0' })
  @Max(2147483646, { message: '配置版本超出范围' })
  version!: number | null;

  @IsArray({ message: '候选角色必须是数组' })
  @ArrayMaxSize(50, { message: '单个场景最多配置 50 个角色' })
  @ArrayUnique({ message: '候选角色不能重复' })
  @Matches(/^[1-9]\d{0,19}$/, { each: true, message: '角色 ID 必须是无前导零的正整数字符串' })
  roleIds!: string[];
}
