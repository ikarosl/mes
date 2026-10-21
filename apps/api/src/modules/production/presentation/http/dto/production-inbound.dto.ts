import { IsIn, IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import {
  INBOUND_ORDER_STATUSES,
  INVENTORY_BATCH_STATUSES,
  INVENTORY_SOURCE_TYPES,
  INVENTORY_ITEM_KINDS,
} from '@company/constants';
import type {
  InventoryBatchQuery,
  InventoryMaterialSupplyDemandQuery,
  InventoryMaterialDemandTraceQuery,
  PurchaseInboundOrderQuery,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';

export class InboundIdParamDto {
  @IsString() @MaxLength(20) inboundId!: string;
}
export class InventoryBatchIdParamDto {
  @IsString() @MaxLength(20) itemBatchId!: string;
}
export class InventoryItemIdParamDto {
  @IsString() @MaxLength(20) itemId!: string;
}
export class PurchaseInboundQueryDto extends PageQueryDto implements PurchaseInboundOrderQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(INBOUND_ORDER_STATUSES) status?: PurchaseInboundOrderQuery['status'];
}
export class InventoryBatchQueryDto extends PageQueryDto implements InventoryBatchQuery {
  @IsOptional() @IsIn(INVENTORY_ITEM_KINDS) itemKind?: InventoryBatchQuery['itemKind'];
  @IsOptional() @IsIn(INVENTORY_SOURCE_TYPES) sourceType?: InventoryBatchQuery['sourceType'];
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsString() @MaxLength(100) batchCode?: string;
  @IsOptional() @IsIn(INVENTORY_BATCH_STATUSES) batchStatus?: InventoryBatchQuery['batchStatus'];
}
export class InventoryMaterialSupplyDemandQueryDto
  extends PageQueryDto
  implements InventoryMaterialSupplyDemandQuery
{
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
}
export class InventoryMaterialDemandTraceQueryDto
  extends PageQueryDto
  implements InventoryMaterialDemandTraceQuery
{
  @IsString() @Matches(/^[1-9]\d{0,19}$/) materialVariantId!: string;
}
