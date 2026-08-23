import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsIn,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { OUTBOUND_ORDER_STATUSES } from '@company/constants';
import type {
  CreateMaterialAllocationsPayload,
  CreateMaterialOutboundPayload,
  MaterialOutboundQuery,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class BatchIdParamDto {
  @IsString() @MaxLength(20) batchId!: string;
}
export class DemandIdParamDto {
  @IsString() @MaxLength(20) demandId!: string;
}
export class AllocationParamDto extends BatchIdParamDto {
  @IsString() @MaxLength(20) allocationId!: string;
}
export class OutboundIdParamDto {
  @IsString() @MaxLength(20) outboundId!: string;
}

export class MaterialOutboundQueryDto extends PageQueryDto implements MaterialOutboundQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(OUTBOUND_ORDER_STATUSES) status?: MaterialOutboundQuery['status'];
}

export class CreateMaterialAllocationLineDto {
  @IsString() @MaxLength(20) demandId!: string;
  @IsString() @MaxLength(20) itemBatchId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(99_999_999) assignedQuantity!: number;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class CreateMaterialAllocationsDto implements CreateMaterialAllocationsPayload {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialAllocationLineDto)
  allocations!: CreateMaterialAllocationLineDto[];
}
export class CreateMaterialOutboundDetailDto {
  @IsString() @MaxLength(20) allocationId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(99_999_999) outboundQuantity!: number;
}
export class CreateMaterialOutboundDto implements CreateMaterialOutboundPayload {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateMaterialOutboundDetailDto)
  details!: CreateMaterialOutboundDetailDto[];
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
