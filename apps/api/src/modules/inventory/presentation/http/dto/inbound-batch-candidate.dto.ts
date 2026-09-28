import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class MaterialInboundBatchCandidateQueryDto extends PageQueryDto {
  @Matches(/^[1-9]\d*$/) materialVariantId!: string;
  @IsString() @MaxLength(20) unit!: string;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
}
export class FinishedInboundBatchCandidateQueryDto extends PageQueryDto {
  @Matches(/^[1-9]\d*$/) productId!: string;
  @IsString() @MaxLength(20) unit!: string;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
}
