import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { FINISHED_GOODS_INBOUND_SOURCES, PRODUCTION_OUTPUT_QUANTITY_MAX } from '@company/constants';
import type {
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundCandidateQuery,
  ConfirmFinishedGoodsInboundPayload,
  ConfirmFinishedGoodsInboundLine,
  FinishedGoodsInboundTarget,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';
export class FinishedInboundIdParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) inboundId!: string;
}
export class FinishedInboundQueryDto extends PageQueryDto implements FinishedGoodsInboundQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional()
  @IsIn(FINISHED_GOODS_INBOUND_SOURCES)
  sourceType?: FinishedGoodsInboundQuery['sourceType'];
  @IsOptional() @IsIn(['completed']) status?: 'completed';
}
export class FinishedInboundCandidateQueryDto
  extends PageQueryDto
  implements FinishedGoodsInboundCandidateQuery
{
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional()
  @IsIn(FINISHED_GOODS_INBOUND_SOURCES)
  sourceType?: FinishedGoodsInboundCandidateQuery['sourceType'];
}
export class FinishedInboundTargetDto {
  @IsIn(['new', 'existing']) mode!: FinishedGoodsInboundTarget['mode'];
  @ValidateIf((target: FinishedInboundTargetDto) => target.mode === 'new')
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clientKey?: string;
  @ValidateIf((target: FinishedInboundTargetDto) => target.mode === 'existing')
  @IsDefined()
  @IsString()
  @Matches(/^[1-9]\d{0,19}$/)
  batchId?: string;
}
export class ConfirmFinishedInboundLineDto implements ConfirmFinishedGoodsInboundLine {
  @IsString() @IsNotEmpty() @MaxLength(100) detailKey!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) allocationId!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) revisionId!: string;
  @IsInt() @Min(1) @Max(PRODUCTION_OUTPUT_QUANTITY_MAX) quantity!: number;
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => FinishedInboundTargetDto)
  target!: FinishedGoodsInboundTarget;
}
export class ConfirmFinishedInboundDto implements ConfirmFinishedGoodsInboundPayload {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) productionBatchId!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmFinishedInboundLineDto)
  details!: ConfirmFinishedInboundLineDto[];
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
