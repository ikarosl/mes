import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { APPROVAL_INSTANCE_STATUSES, APPROVAL_LIST_SCOPES } from '@company/constants';
import type {
  ApprovalCommentCommand,
  ApprovalDecisionCommand,
  ApprovalInstanceQuery,
  ApprovalListScope,
  ApprovalInstanceStatus,
  PublishApprovalFlowCommand,
  SaveApprovalFlowDraft,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class ApprovalSceneCodeParamDto {
  @Matches(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/)
  sceneCode!: string;
}

export class ApprovalIdParamDto {
  @IsNumberString({ no_symbols: true })
  id!: string;
}

export class ApprovalProductIdParamDto {
  @IsNumberString({ no_symbols: true })
  productId!: string;
}

export class ApprovalFlowStepDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nodeCode?: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsNumberString({ no_symbols: true })
  roleId!: string;
}

export class SaveApprovalFlowDraftDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  // 首次保存允许显式传 null；省略字段仍必须被拒绝，避免把并发版本校验降级成无版本写入。
  @ValidateIf((_object, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number | null;

  // 草稿身份与 version 成对出现：无草稿时显式 null，已有草稿时必须是数字字符串。
  @ValidateIf((_object, value) => value !== null)
  @IsNumberString({ no_symbols: true })
  draftId!: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ApprovalFlowStepDto)
  steps!: ApprovalFlowStepDto[];
}

export class PublishApprovalFlowDto {
  @IsNumberString({ no_symbols: true })
  draftId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

export class ApprovalInstanceQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(APPROVAL_LIST_SCOPES)
  scope?: ApprovalListScope;

  @IsOptional()
  @IsIn(APPROVAL_INSTANCE_STATUSES)
  status?: ApprovalInstanceStatus;

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  subjectId?: string;
}

export class ApprovalDecisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsNumberString({ no_symbols: true })
  taskId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ApprovalCommentDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class SubmitBomApprovalDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

export const toFlowDraft = (body: SaveApprovalFlowDraftDto): SaveApprovalFlowDraft => ({
  name: body.name.trim(),
  draftId: body.draftId ?? null,
  version: body.version ?? null,
  steps: body.steps.map((step) => ({
    nodeCode: step.nodeCode?.trim() || undefined,
    name: step.name.trim(),
    roleId: step.roleId,
  })),
});

export const toPublishCommand = (body: PublishApprovalFlowDto): PublishApprovalFlowCommand => ({
  draftId: body.draftId,
  version: body.version,
});

export const toDecision = (body: ApprovalDecisionDto): ApprovalDecisionCommand => ({
  version: body.version,
  taskId: body.taskId,
  comment: body.comment?.trim() || undefined,
});

export const toComment = (body: ApprovalCommentDto): ApprovalCommentCommand => ({
  version: body.version,
  comment: body.comment?.trim() || undefined,
});

export const toInstanceQuery = (query: ApprovalInstanceQueryDto): ApprovalInstanceQuery => ({
  page: query.page,
  pageSize: query.pageSize,
  scope: query.scope,
  status: query.status,
  subjectId: query.subjectId,
});
