import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
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
  ValidateNested,
} from 'class-validator';
import {
  OTHER_INVENTORY_DIRECTIONS,
  OTHER_INVENTORY_ORDER_STATUSES,
  INVENTORY_TARGET_MODES,
} from '@company/constants';
import type {
  InventoryInboundTarget,
  OtherInventoryDraftPayload,
  OtherInventoryLinePayload,
  OtherInventoryOrderQuery,
  OtherStockCandidateQuery,
  OtherStockObjectQuery,
  SaveOtherInventoryDraftPayload,
} from '@company/contracts';
import { PageQueryDto } from '../../../../../presentation/http/dto/page-query.dto.js';
export class OtherInventoryIdParamDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) orderId!: string;
}
export class OtherInventoryOrderQueryDto extends PageQueryDto implements OtherInventoryOrderQuery {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(OTHER_INVENTORY_ORDER_STATUSES) status?: OtherInventoryOrderQuery['status'];
}
export class OtherInventoryTargetDto {
  @IsIn(INVENTORY_TARGET_MODES) mode!: InventoryInboundTarget['mode'];
  @ValidateIf((row: OtherInventoryTargetDto) => row.mode === 'new')
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clientKey?: string;
  @ValidateIf((row: OtherInventoryTargetDto) => row.mode === 'existing')
  @IsDefined()
  @IsString()
  @Matches(/^[1-9]\d{0,19}$/)
  batchId?: string;
}
export class OtherInventoryLineDto implements OtherInventoryLinePayload {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) id?: string;
  @IsIn(['material', 'finished_product']) itemKind!: OtherInventoryLinePayload['itemKind'];
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) materialVariantId?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,19}$/) productId?: string;
  @IsInt() @Min(1) @Max(99_999_999) quantity!: number;
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => OtherInventoryTargetDto)
  target!: InventoryInboundTarget;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
}
export class OtherInventoryDraftDto implements OtherInventoryDraftPayload {
  @IsString() @IsNotEmpty() @MaxLength(5000) reason!: string;
  @IsOptional() @IsString() @MaxLength(5000) remark?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OtherInventoryLineDto)
  details!: OtherInventoryLineDto[];
}
export class SaveOtherInventoryDraftDto
  extends OtherInventoryDraftDto
  implements SaveOtherInventoryDraftPayload
{
  @IsInt() @Min(0) version!: number;
}
export class OtherStockCandidateQueryDto extends PageQueryDto implements OtherStockCandidateQuery {
  @IsIn(OTHER_INVENTORY_DIRECTIONS) direction!: OtherStockCandidateQuery['direction'];
  @IsOptional()
  @IsIn(['material', 'finished_product'])
  itemKind?: OtherStockCandidateQuery['itemKind'];
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) materialVariantId?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) productId?: string;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
}
export class OtherStockObjectQueryDto implements OtherStockObjectQuery {
  @IsIn(['material', 'finished_product']) itemKind!: OtherStockObjectQuery['itemKind'];
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayMaxSize(100)
  @Matches(/^[1-9]\d{0,19}$/, { each: true })
  includeIds?: string[];
}
