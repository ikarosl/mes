import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  PURCHASE_ORDER_MAX_QUANTITY,
  QUALITY_INBOUND_CASE_TYPES,
  QUALITY_INBOUND_METHODS,
  QUALITY_INBOUND_DISPOSITIONS,
  QUALITY_INBOUND_TASK_STATUSES,
  QUALITY_INBOUND_TEXT_MAX_LENGTH,
  RECEIPT_HISTORY_KINDS,
} from '@company/constants';
import type {
  QualityInboundCaseType,
  QualityInboundDisposition,
  QualityInboundInspectionMethod,
  ProcurementInboundInspectionQuery,
  ReceiptHistoryKind,
} from '@company/contracts';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
import { PurchaseOrderIdDto, PurchaseOrderVersionDto } from './purchase-order.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((item) => item.trim()) : value;
const ID = /^[1-9]\d{0,19}$/;
export class ReceiptListQueryDto extends PageQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @Matches(ID) supplierId?: string;
  @IsOptional() @Matches(ID) purchaseOrderId?: string;
}
export class ReceiptReleaseQueryDto extends ReceiptListQueryDto {
  @IsOptional() @Matches(ID) receiptLineId?: string;
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(ID, { each: true })
  scopeIds?: string[];
}
export class InboundInspectionQueryDto extends ReceiptListQueryDto {
  @IsOptional()
  @IsIn(QUALITY_INBOUND_TASK_STATUSES)
  status?: ProcurementInboundInspectionQuery['status'];
  @IsOptional() @IsIn(QUALITY_INBOUND_CASE_TYPES) caseType?: QualityInboundCaseType;
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(ID, { each: true })
  receiptLineIds?: string[];
}
export class ReceiptHistoryPathDto extends PurchaseOrderIdDto {
  @IsIn(RECEIPT_HISTORY_KINDS) historyKind!: ReceiptHistoryKind;
}
export class ConfirmReceiptDetailDto extends PurchaseOrderVersionDto {
  @Matches(ID) purchaseOrderLineId!: string;
  @IsInt() @Min(1) @Max(PURCHASE_ORDER_MAX_QUANTITY) receivedQuantity!: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) supplierBatchCode?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) overReceiptNote?: string | null;
}
export class ConfirmProcurementReceiptDto {
  @Matches(ID) purchaseOrderId!: string;
  @IsInt() @Min(0) @Max(2147483647) purchaseOrderVersion!: number;
  @IsISO8601({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) receivedAt!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) handoverEvidence!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) remark?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ConfirmReceiptDetailDto)
  details!: ConfirmReceiptDetailDto[];
}
export class CorrectReceiptAdjustmentDto {
  @Matches(ID) scopeId!: string;
  @IsInt() @Min(0) @Max(2147483647) scopeVersion!: number;
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) revisedQuantity!: number;
}
export class CorrectReceiptDto extends PurchaseOrderVersionDto {
  @Matches(ID) previousRevisionId!: string;
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) receivedQuantity!: number;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
  @Equals(true) physicalIdentityConfirmed!: true;
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((item: CorrectReceiptAdjustmentDto) => item.scopeId)
  @ValidateNested({ each: true })
  @Type(() => CorrectReceiptAdjustmentDto)
  adjustments!: CorrectReceiptAdjustmentDto[];
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) newRemainderQuantity = 0;
}
export class ReceiptScopeCommandDto extends PurchaseOrderVersionDto {
  @Matches(ID) scopeId!: string;
  @IsInt() @Min(0) @Max(2147483647) scopeVersion!: number;
}
export class TerminateReceiptReturnDto extends ReceiptScopeCommandDto {
  @IsInt() @Min(1) @Max(PURCHASE_ORDER_MAX_QUANTITY) quantity!: number;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
}
export class StartReceiptReviewDto extends TerminateReceiptReturnDto {
  @IsIn(QUALITY_INBOUND_CASE_TYPES.filter((type) => type !== 'receipt_correction'))
  caseType!: Exclude<QualityInboundCaseType, 'receipt_correction'>;
}
export class InspectReceiptDto extends PurchaseOrderVersionDto {
  @Matches(ID) caseId!: string;
  @IsInt() @Min(0) @Max(2147483647) caseVersion!: number;
  @Matches(ID) receiptRevisionId!: string;
  @IsIn(QUALITY_INBOUND_METHODS) inspectionMethod!: QualityInboundInspectionMethod;
  @IsOptional() @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) qualifiedQuantity:
    number | null = null;
  @IsOptional() @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) unqualifiedQuantity:
    number | null = null;
  @IsOptional() @IsInt() @Min(1) @Max(PURCHASE_ORDER_MAX_QUANTITY) sampleQuantity: number | null =
    null;
  @IsOptional() @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) sampleUnqualifiedQuantity:
    number | null = null;
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) removedDefectQuantity!: number;
  @IsBoolean() inboundApproved!: boolean;
  @IsIn(QUALITY_INBOUND_DISPOSITIONS) disposition!: QualityInboundDisposition;
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(QUALITY_INBOUND_TEXT_MAX_LENGTH)
  remark!: string;
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(QUALITY_INBOUND_TEXT_MAX_LENGTH)
  evidence!: string;
}
export class ConfirmSupplierReturnDto extends ReceiptScopeCommandDto {
  @Matches(ID) receiptRevisionId!: string;
  @IsISO8601({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) returnedAt!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) handoverEvidence!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) remark?: string | null;
}
export class ConfirmProcurementInboundDetailDto extends ReceiptScopeCommandDto {
  @Matches(ID) receiptLineId!: string;
  @Matches(ID) receiptRevisionId!: string;
  @Matches(ID) inspectionId!: string;
  @IsInt() @Min(1) @Max(PURCHASE_ORDER_MAX_QUANTITY) quantity!: number;
}
export class ConfirmProcurementInboundDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) remark?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((item: ConfirmProcurementInboundDetailDto) => item.scopeId)
  @ValidateNested({ each: true })
  @Type(() => ConfirmProcurementInboundDetailDto)
  details!: ConfirmProcurementInboundDetailDto[];
}
