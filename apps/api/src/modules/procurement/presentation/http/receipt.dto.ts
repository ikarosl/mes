import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
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
  PROCUREMENT_RECEIPT_MAX_LINES,
  PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH,
  QUALITY_INBOUND_METHODS,
  QUALITY_INBOUND_TEXT_MAX_LENGTH,
  RECEIPT_HISTORY_KINDS,
} from '@company/constants';
import type {
  QualityInspectionMethod,
  ReceiptHistoryKind,
  InventoryInboundTarget,
  JsonTableData,
} from '@company/contracts';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';
import { PurchaseOrderIdDto, PurchaseOrderVersionDto } from './purchase-order.dto.js';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((item) => item.trim()) : value;
const ID = /^[1-9]\d{0,19}$/;
class ReceiptSourceQueryDto extends PageQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @Matches(ID) supplierId?: string;
}
export class ReceiptQueryDto extends ReceiptSourceQueryDto {
  @IsOptional() @Matches(ID) purchaseOrderId?: string;
}
export class ReceiptSourceCandidatesQueryDto extends ReceiptSourceQueryDto {
  @IsOptional() @Matches(ID) purchaseOrderId?: string;
  @IsOptional() @Matches(ID) receiptLineId?: string;
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
export class InspectionReportPathDto {
  @Matches(ID) reportId!: string;
}
export class ConfirmReceiptDetailDto extends PurchaseOrderVersionDto {
  @Matches(ID) purchaseOrderLineId!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) supplierBatchCode?: string | null;
}
export class ConfirmProcurementReceiptDto {
  @Matches(ID) purchaseOrderId!: string;
  @IsInt() @Min(0) @Max(2147483647) purchaseOrderVersion!: number;
  @IsISO8601({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) receivedAt!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) handoverEvidence?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) remark?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PROCUREMENT_RECEIPT_MAX_LINES)
  @ArrayUnique((row: ConfirmReceiptDetailDto) => row.purchaseOrderLineId)
  @ValidateNested({ each: true })
  @Type(() => ConfirmReceiptDetailDto)
  details!: ConfirmReceiptDetailDto[];
}
export class ReceiptVoidLineVersionDto extends PurchaseOrderVersionDto {
  @Matches(ID) receiptLineId!: string;
}
export class VoidProcurementReceiptDto extends PurchaseOrderVersionDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PROCUREMENT_RECEIPT_MAX_LINES)
  @ArrayUnique((row: ReceiptVoidLineVersionDto) => row.receiptLineId)
  @ValidateNested({ each: true })
  @Type(() => ReceiptVoidLineVersionDto)
  lines!: ReceiptVoidLineVersionDto[];
}
export class InspectReceiptDto {
  @IsIn(QUALITY_INBOUND_METHODS) inspectionMethod!: QualityInspectionMethod;
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) qualifiedQuantity!: number;
  @IsInt() @Min(0) @Max(PURCHASE_ORDER_MAX_QUANTITY) unqualifiedQuantity!: number;
  @IsISO8601({ strict: true }) @Matches(/(?:Z|[+-]\d{2}:\d{2})$/) inspectedAt!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) expiresOn?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(QUALITY_INBOUND_TEXT_MAX_LENGTH) remark?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(QUALITY_INBOUND_TEXT_MAX_LENGTH) evidence?:
    string | null;
  @IsOptional() @Matches(ID) previousRecordId?: string | null;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(QUALITY_INBOUND_TEXT_MAX_LENGTH)
  correctionReason?: string | null;
  @IsObject({ message: '检验记录必须是 JSON 表格对象' })
  inspectionDetails!: JsonTableData;
}
export class InboundTargetDto {
  @IsIn(['new', 'existing']) mode!: 'new' | 'existing';
  @ValidateIf((target: InboundTargetDto) => target.mode === 'new')
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clientKey?: string;
  @ValidateIf((target: InboundTargetDto) => target.mode === 'existing')
  @Matches(ID)
  batchId?: string;
}
export class RecordReceiptHandlingDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROCUREMENT_RECEIPT_HANDLING_NOTE_MAX_LENGTH)
  otherHandlingNote!: string;
}
export class ConfirmProcurementInboundDetailDto extends PurchaseOrderVersionDto {
  @Matches(ID) receiptLineId!: string;
  @IsInt() @Min(1) @Max(PURCHASE_ORDER_MAX_QUANTITY) quantity!: number;
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => InboundTargetDto)
  target!: InventoryInboundTarget;
}
export class ConfirmProcurementInboundDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) remark?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ConfirmProcurementInboundDetailDto)
  details!: ConfirmProcurementInboundDetailDto[];
}
