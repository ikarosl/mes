import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  ATTACHMENT_LIFECYCLES,
  ATTACHMENT_REFERENCE_STATES,
  TECHNICAL_FILE_TYPES,
} from '@company/constants';
import type {
  AttachmentLifecycle,
  AttachmentReferenceState,
  TechnicalFileType,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class AttachmentIdParamDto {
  @Matches(/^[1-9]\d{0,19}$/, { message: '附件 ID 必须是正整数字符串' })
  id!: string;
}

export class AttachmentQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString({ message: '附件关键词必须是文本' })
  @MaxLength(100, { message: '附件关键词不能超过 100 个字符' })
  keyword?: string;

  @IsOptional()
  @IsIn(TECHNICAL_FILE_TYPES, { message: '附件类型无效' })
  fileType?: TechnicalFileType;

  @IsOptional()
  @IsIn(ATTACHMENT_REFERENCE_STATES, { message: '附件引用状态无效' })
  referenceState?: AttachmentReferenceState;

  @IsOptional()
  @IsIn(ATTACHMENT_LIFECYCLES, { message: '附件生命周期无效' })
  lifecycle?: AttachmentLifecycle;
}

export class AttachmentLifecycleDto {
  @IsInt({ message: '附件版本必须是整数' })
  @Min(0, { message: '附件版本不能小于 0' })
  @Max(2147483646, { message: '附件版本超出范围，请刷新后重试' })
  version!: number;
}
