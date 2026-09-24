import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import {
  DEMAND_TYPES,
  PURCHASE_ORDER_CLOSURE_REASONS,
  PURCHASE_ORDER_SUPPLEMENT_REASONS,
  PURCHASE_ORDER_SOURCE_TYPES,
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_MAX_LINES,
  PURCHASE_ORDER_MAX_DEMANDS,
  PURCHASE_ORDER_MAX_QUANTITY,
} from '@company/constants';
import type {
  PurchaseOrderClosureReason,
  PurchaseOrderSupplementReason,
  PurchaseOrderSourceType,
  PurchaseOrderStatus,
  DemandType,
} from '@company/contracts';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',') : value;
export class PurchaseOrderIdDto {
  @Matches(/^[1-9]\d{0,19}$/) id!: string;
}
export class PurchaseOrderQueryDto extends PageQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) supplierId?: string;
  @IsOptional() @IsIn(PURCHASE_ORDER_SOURCE_TYPES) sourceType?: PurchaseOrderSourceType;
  @IsOptional() @IsIn(PURCHASE_ORDER_STATUSES) status?: PurchaseOrderStatus;
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) originOrderLineId?: string;
}
export class PurchaseExcessReceiptCandidateQueryDto extends PageQueryDto {
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) receiptLineId?: string;
}
export class PurchaseOrderDraftLineDto {
  @Matches(/^[1-9]\d{0,19}$/) supplierId!: string;
  @Matches(/^[1-9]\d{0,19}$/) itemId!: string;
  @Matches(/^[1-9]\d{0,19}$/) materialVariantId!: string;
  @IsInt() @Min(1) @Max(PURCHASE_ORDER_MAX_QUANTITY) plannedQuantity!: number;
  @IsArray()
  @ArrayMaxSize(PURCHASE_ORDER_MAX_DEMANDS)
  @ArrayUnique()
  @Matches(/^[1-9]\d{0,19}$/, { each: true })
  demandIds!: string[];
}
export class CreatePurchaseOrderDto {
  @ValidateIf((_object, value) => value !== null)
  @Matches(/^[1-9]\d{0,19}$/)
  workOrderId!: string | null;
  @IsIn(PURCHASE_ORDER_SOURCE_TYPES) sourceType!: PurchaseOrderSourceType;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) remark?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PURCHASE_ORDER_MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderDraftLineDto)
  items!: PurchaseOrderDraftLineDto[];
}
export class UpdatePurchaseOrderDto extends CreatePurchaseOrderDto {
  @IsInt() @Min(0) @Max(2147483647) version!: number;
}
export class PurchaseOrderVersionDto {
  @IsInt() @Min(0) @Max(2147483647) version!: number;
}
export class CancelPurchaseOrderDto extends PurchaseOrderVersionDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
}
export class ClosePurchaseOrderLineDto extends CancelPurchaseOrderDto {
  @IsIn(PURCHASE_ORDER_CLOSURE_REASONS) reasonType!: PurchaseOrderClosureReason;
}
export class CreatePurchaseOrderSupplementDto {
  @IsIn(PURCHASE_ORDER_SUPPLEMENT_REASONS) supplementReason!: PurchaseOrderSupplementReason;
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) originReceiptLineId?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) originAllocationId?: string;
  @IsInt() @Min(1) @Max(PURCHASE_ORDER_MAX_QUANTITY) plannedQuantity!: number;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) supplementEvidence!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) remark?: string | null;
}
export class ProcurementDemandCandidateQueryDto extends PageQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @Matches(/^[1-9]\d{0,19}$/) workOrderId!: string;
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) batchId?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,19}$/) itemId?: string;
  @IsOptional()
  @IsIn(DEMAND_TYPES)
  demandType?: DemandType;
}
export class ProcurementDemandWorkOrderQueryDto extends PageQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
}
export class ResolveProcurementDemandsDto {
  @Matches(/^[1-9]\d{0,19}$/) workOrderId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PURCHASE_ORDER_MAX_DEMANDS)
  @ArrayUnique()
  @Matches(/^[1-9]\d{0,19}$/, { each: true })
  demandIds!: string[];
}
export class RelatedPurchasesQueryDto extends PageQueryDto {
  @Transform(csv)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PURCHASE_ORDER_MAX_DEMANDS)
  @ArrayUnique()
  @Matches(/^[1-9]\d{0,19}$/, { each: true })
  demandIds!: string[];
}
export class ProcurementMaterialOptionsDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(/^[1-9]\d{0,19}$/, { each: true })
  includeIds?: string[];
}
export class ProcurementMaterialVariantsDto {
  @Matches(/^[1-9]\d{0,19}$/) materialId!: string;
}
