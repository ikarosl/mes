import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { INBOUND_ORDER_STATUSES, INVENTORY_BATCH_STATUSES } from '@company/constants';
import type {
  CreatePurchaseInboundPayload,
  InventoryBatchQuery,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class InboundIdParamDto {
  @IsString() @MaxLength(20) inboundId!: string;
}
export class InventoryBatchIdParamDto {
  @IsString() @MaxLength(20) itemBatchId!: string;
}
export class PurchaseInboundQueryDto extends PageQueryDto implements PurchaseInboundOrderQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(INBOUND_ORDER_STATUSES) status?: PurchaseInboundOrderQuery['status'];
}
export class InventoryBatchQueryDto extends PageQueryDto implements InventoryBatchQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsString() @MaxLength(100) batchCode?: string;
  @IsOptional() @IsIn(INVENTORY_BATCH_STATUSES) batchStatus?: InventoryBatchQuery['batchStatus'];
}
export class CreatePurchaseInboundLineDto {
  @IsString() @MaxLength(20) itemId!: string;
  @IsString() @MaxLength(100) batchCode!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(99_999_999) inboundQuantity!: number;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class CreatePurchaseInboundDto implements CreatePurchaseInboundPayload {
  @IsOptional() @IsString() @MaxLength(100) inboundNo?: string | null;
  @IsOptional() @IsString() @MaxLength(100) provider?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseInboundLineDto)
  details!: CreatePurchaseInboundLineDto[];
}
