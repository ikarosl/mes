import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsDefined,
  IsIn,
  IsObject,
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
  ValidateIf,
} from 'class-validator';
import {
  PURCHASE_ORDER_MAX_QUANTITY,
  QUALITY_INBOUND_CASE_TYPES,
  QUALITY_INBOUND_METHODS,
  QUALITY_RELEASE_DECISIONS,
  QUALITY_INBOUND_TASK_STATUSES,
  QUALITY_INBOUND_TEXT_MAX_LENGTH,
  RECEIPT_HISTORY_KINDS,
  RECEIPT_ROUND_STATUSES,
  RECEIPT_ALLOCATION_DISPOSITIONS,
  RECEIPT_RETURN_REASONS,
} from '@company/constants';
import type {
  QualityInboundCaseType,
  QualityReleaseDecision,
  QualityInboundInspectionMethod,
  ProcurementInboundInspectionQuery,
  ReceiptHistoryKind,
  ReceiptAllocationDisposition,
  ReceiptReturnReason,
  InventoryInboundTarget,
} from '@company/contracts';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
import { PurchaseOrderIdDto, PurchaseOrderVersionDto } from './purchase-order.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((item) => item.trim()) : value;
const ID = /^[1-9]\d{0,19}$/;
export class ReceiptListQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['yes']) awaitingAcceptance?: 'yes';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @Matches(ID) supplierId?: string;
  @IsOptional() @Matches(ID) purchaseOrderId?: string;
}
export class ReceiptAllocationCandidateQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(ID, { each: true })
  includeIds?: string[];
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
  allocationIds?: string[];
}
export class InboundInspectionQueryDto extends ReceiptListQueryDto {
  @IsOptional()
  @IsIn(RECEIPT_ROUND_STATUSES)
  roundStatus?: ProcurementInboundInspectionQuery['roundStatus'];
  @IsOptional()
  @IsIn(RECEIPT_ROUND_STATUSES)
  currentRoundStatus?: ProcurementInboundInspectionQuery['currentRoundStatus'];
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
export class ReceiptRoundCommandDto extends PurchaseOrderVersionDto {
  @Matches(ID) roundId!: string;
  @IsInt() @Min(0) @Max(2147483647) roundVersion!: number;
}
export class ReceiptOwnershipDto {
  @Matches(ID) purchaseOrderLineId!: string;
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) quantity!: number;
}
export class ReceiptOwnershipCommandDto extends ReceiptRoundCommandDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique((item: ReceiptOwnershipDto) => item.purchaseOrderLineId)
  @ValidateNested({ each: true })
  @Type(() => ReceiptOwnershipDto)
  ownership?: ReceiptOwnershipDto[];
}
export class CorrectReceiptDto extends ReceiptRoundCommandDto {
  @Matches(ID) previousRevisionId!: string;
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) receivedQuantity!: number;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
  @Equals(true) physicalIdentityConfirmed!: true;
}
export class ReceiptAllocationCommandDto extends ReceiptRoundCommandDto {
  @Matches(ID) allocationId!: string;
}
export class RejectReceiptDto extends ReceiptOwnershipCommandDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
}
export class RevokeReceiptRejectionDto extends ReceiptRoundCommandDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
}
export class StartReceiptReviewDto extends ReceiptRoundCommandDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
  @IsIn(QUALITY_INBOUND_CASE_TYPES.filter((type) => type !== 'receipt_correction'))
  caseType!: Exclude<QualityInboundCaseType, 'receipt_correction'>;
}
export class InspectReceiptDto extends ReceiptRoundCommandDto {
  @Matches(ID) caseId!: string;
  @IsInt() @Min(0) @Max(2147483647) caseVersion!: number;
  @Matches(ID) receiptRevisionId!: string;
  @IsIn(QUALITY_INBOUND_METHODS) inspectionMethod!: QualityInboundInspectionMethod;
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) qualifiedQuantity!: number;
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) unqualifiedQuantity!: number;
  @IsIn(QUALITY_RELEASE_DECISIONS) releaseDecision!: QualityReleaseDecision;
  @IsISO8601({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) inspectedAt!: string;
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
export class ConfirmSupplierReturnDto extends ReceiptAllocationCommandDto {
  @Matches(ID) receiptRevisionId!: string;
  @IsISO8601({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) returnedAt!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) handoverEvidence!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) remark?: string | null;
}
export class InboundTargetDto {
  @IsIn(['new', 'existing']) mode!: 'new' | 'existing';
  @ValidateIf((target: InboundTargetDto) => target.mode === 'new')
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clientKey?: string;
  @ValidateIf((target: InboundTargetDto) => target.mode === 'existing')
  @Matches(ID)
  batchId?: string;
}
export class ConfirmProcurementInboundDetailDto extends ReceiptAllocationCommandDto {
  @IsString() @IsNotEmpty() @MaxLength(100) detailKey!: string;
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => InboundTargetDto)
  target!: InventoryInboundTarget;
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
  @ArrayUnique((item: ConfirmProcurementInboundDetailDto) => item.detailKey)
  @ValidateNested({ each: true })
  @Type(() => ConfirmProcurementInboundDetailDto)
  details!: ConfirmProcurementInboundDetailDto[];
}

export class ReceiptAllocationDto {
  @IsOptional() @Matches(ID) purchaseOrderLineId: string | null = null;
  @IsIn(RECEIPT_ALLOCATION_DISPOSITIONS) disposition!: ReceiptAllocationDisposition;
  @IsInt() @Min(1) @Max(PURCHASE_ORDER_MAX_QUANTITY) quantity!: number;
  @IsOptional()
  @IsIn(RECEIPT_RETURN_REASONS.filter((reason) => reason !== 'manual_rejection'))
  returnReason: ReceiptReturnReason | null = null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) remark?: string | null;
}
export class ConfirmReceiptAcceptanceDto extends ReceiptRoundCommandDto {
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) confirmedQuantity!: number;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) overrideReason?:
    string | null;
  @Matches(ID) receiptRevisionId!: string;
  @Matches(ID) caseId!: string;
  @Matches(ID) inspectionId!: string;
  @Equals(true) physicalIdentityConfirmed!: true;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) remark!: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationDto)
  details!: ReceiptAllocationDto[];
}
