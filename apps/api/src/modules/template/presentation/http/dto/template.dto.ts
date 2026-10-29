import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { BUSINESS_TEMPLATE_STATUSES } from '@company/constants';
import type { BusinessTemplateStatus, JsonTableData } from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class TemplateIdParamDto {
  @Matches(/^[1-9]\d{0,19}$/, { message: '模板 ID 必须是正整数字符串' })
  id!: string;
}

export class TemplateListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(BUSINESS_TEMPLATE_STATUSES, { message: '模板状态无效' })
  status?: BusinessTemplateStatus;

  @IsOptional()
  @IsString({ message: '模板关键词必须是文本' })
  @MaxLength(100, { message: '模板关键词不能超过 100 个字符' })
  keyword?: string;
}

export class CreateTemplateDto {
  @IsString({ message: '模板名称必须是文本' })
  @IsNotEmpty({ message: '模板名称不能为空' })
  @MaxLength(100, { message: '模板名称不能超过 100 个字符' })
  name!: string;

  @IsObject({ message: '模板内容必须是 JSON 对象' })
  content!: JsonTableData;

  @IsIn(BUSINESS_TEMPLATE_STATUSES, { message: '模板状态无效' })
  status!: BusinessTemplateStatus;
}

export class UpdateTemplateDto {
  @IsInt({ message: '模板版本必须是整数' })
  @Min(0, { message: '模板版本不能小于 0' })
  @Max(2147483646, { message: '模板版本超出范围，请刷新后重试' })
  version!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: '模板名称必须是文本' })
  @IsNotEmpty({ message: '模板名称不能为空' })
  @MaxLength(100, { message: '模板名称不能超过 100 个字符' })
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject({ message: '模板内容必须是 JSON 对象' })
  content?: JsonTableData;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(BUSINESS_TEMPLATE_STATUSES, { message: '模板状态无效' })
  status?: BusinessTemplateStatus;
}
