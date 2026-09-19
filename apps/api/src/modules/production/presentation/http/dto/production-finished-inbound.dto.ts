import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { FINISHED_GOODS_INBOUND_SOURCES, INBOUND_ORDER_STATUSES } from '@company/constants';
import type {
  FinishedGoodsInboundQuery,
  FinishedGoodsInboundCandidateQuery,
  CreateFinishedGoodsInboundPayload,
  UpdateFinishedGoodsInboundPayload,
  ConfirmFinishedGoodsInboundPayload,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';
import { VersionedCommandDto } from '../../../../../presentation/http/dto/versioned-command.dto.js';

export class FinishedInboundIdParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) inboundId!: string;
}
export class FinishedInboundQueryDto extends PageQueryDto implements FinishedGoodsInboundQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional()
  @IsIn(FINISHED_GOODS_INBOUND_SOURCES)
  sourceType?: FinishedGoodsInboundQuery['sourceType'];
  @IsOptional() @IsIn(INBOUND_ORDER_STATUSES) status?: FinishedGoodsInboundQuery['status'];
}
export class FinishedInboundCandidateQueryDto
  extends PageQueryDto
  implements FinishedGoodsInboundCandidateQuery
{
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsIn(FINISHED_GOODS_INBOUND_SOURCES)
  sourceType!: FinishedGoodsInboundCandidateQuery['sourceType'];
}
export class CreateFinishedInboundDto implements CreateFinishedGoodsInboundPayload {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) productionBatchId!: string;
  @IsIn(FINISHED_GOODS_INBOUND_SOURCES)
  sourceType!: CreateFinishedGoodsInboundPayload['sourceType'];
  @IsString() @Matches(/^[1-9]\d{0,19}$/) outputRevisionId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) batchCode!: string;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class UpdateFinishedInboundDto
  extends VersionedCommandDto
  implements UpdateFinishedGoodsInboundPayload
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) outputRevisionId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) batchCode!: string;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class ConfirmFinishedInboundDto
  extends VersionedCommandDto
  implements ConfirmFinishedGoodsInboundPayload
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) outputRevisionId!: string;
}
