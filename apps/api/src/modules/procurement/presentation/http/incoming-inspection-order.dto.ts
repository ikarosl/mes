import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
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
  QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS,
  QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH,
  QUALITY_INCOMING_INSPECTION_RECEIPT_ASSOCIATIONS,
  RECEIPT_LINE_STAGES,
} from '@company/constants';
import type {
  ChangeQualityIncomingInspectionAssociationsPayload,
  CreateQualityIncomingInspectionOrderPayload,
  QualityIncomingInspectionAssociationChange,
  QualityIncomingInspectionExpectedOrder,
  QualityIncomingInspectionInitialReceipt,
  QualityIncomingInspectionOrderQuery,
  QualityIncomingInspectionReceiptCandidateQuery,
  UpdateQualityIncomingInspectionOrderPayload,
} from '@company/contracts';
import { PageQueryDto } from '../../../../presentation/http/dto/page-query.dto.js';

const ID = /^[1-9]\d{0,19}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class IncomingInspectionOrderIdDto {
  @Matches(ID) orderId!: string;
}
export class IncomingInspectionReceiptIdDto {
  @Matches(ID) receiptId!: string;
}
export class IncomingInspectionReceiptLineIdDto {
  @Matches(ID) receiptLineId!: string;
}

export class IncomingInspectionTargetQueryDto extends PageQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
}
export class IncomingInspectionOrderQueryDto
  extends IncomingInspectionTargetQueryDto
  implements QualityIncomingInspectionOrderQuery
{
  @IsOptional() @IsIn(RECEIPT_LINE_STAGES) stage?: QualityIncomingInspectionOrderQuery['stage'];
  @IsOptional() @Matches(ID) supplierId?: string;
}
export class IncomingInspectionReceiptCandidateQueryDto
  extends IncomingInspectionTargetQueryDto
  implements QualityIncomingInspectionReceiptCandidateQuery
{
  @IsOptional()
  @IsIn(QUALITY_INCOMING_INSPECTION_RECEIPT_ASSOCIATIONS)
  association?: QualityIncomingInspectionReceiptCandidateQuery['association'];
}
export class IncomingInspectionExpectedOrderDto implements QualityIncomingInspectionExpectedOrder {
  @Matches(ID) orderId!: string;
  @IsInt() @Min(0) @Max(2147483647) expectedVersion!: number;
}
export class IncomingInspectionInitialReceiptDto implements QualityIncomingInspectionInitialReceipt {
  @Matches(ID) receiptId!: string;
  @ValidateIf((value: IncomingInspectionInitialReceiptDto) => value.fromOrderId !== null)
  @Matches(ID)
  fromOrderId!: string | null;
}
export class IncomingInspectionAssociationChangeDto
  extends IncomingInspectionInitialReceiptDto
  implements QualityIncomingInspectionAssociationChange
{
  @ValidateIf((value: IncomingInspectionAssociationChangeDto) => value.toOrderId !== null)
  @Matches(ID)
  toOrderId!: string | null;
}
class IncomingInspectionExpectedOrdersDto {
  @IsArray()
  @ArrayMaxSize(QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS * 2)
  @ArrayUnique((order: IncomingInspectionExpectedOrderDto | null) => order?.orderId)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => IncomingInspectionExpectedOrderDto)
  expectedOrders!: IncomingInspectionExpectedOrderDto[];
}
export class CreateIncomingInspectionOrderDto
  extends IncomingInspectionExpectedOrdersDto
  implements CreateQualityIncomingInspectionOrderPayload
{
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH)
  remark?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS)
  @ArrayUnique((receipt: IncomingInspectionInitialReceiptDto | null) => receipt?.receiptId)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => IncomingInspectionInitialReceiptDto)
  receipts!: IncomingInspectionInitialReceiptDto[];
}
export class ChangeIncomingInspectionAssociationsDto
  extends IncomingInspectionExpectedOrdersDto
  implements ChangeQualityIncomingInspectionAssociationsPayload
{
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(QUALITY_INCOMING_INSPECTION_ORDER_MAX_RECEIPTS)
  @ArrayUnique((change: IncomingInspectionAssociationChangeDto | null) => change?.receiptId)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => IncomingInspectionAssociationChangeDto)
  changes!: IncomingInspectionAssociationChangeDto[];
}
export class UpdateIncomingInspectionOrderDto implements UpdateQualityIncomingInspectionOrderPayload {
  @IsInt() @Min(0) @Max(2147483647) expectedVersion!: number;
  @ValidateIf((value: UpdateIncomingInspectionOrderDto) => value.remark !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(QUALITY_INCOMING_INSPECTION_ORDER_REMARK_MAX_LENGTH)
  remark!: string | null;
}
