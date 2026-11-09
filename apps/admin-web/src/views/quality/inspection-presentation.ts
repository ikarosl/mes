import type {
  ProcurementInboundInspectionDetail,
  QualityInboundCaseItem,
} from '@company/contracts';

const readScopeQuantity = (value: string | null): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
};

/** 当前余额可解释在途送检范围；旧轮或旧修订的送检快照不能套用当前算式。 */
export function incomingInspectionQuantityFormula(
  source: Pick<
    ProcurementInboundInspectionDetail,
    'id' | 'currentReceiptRevisionId' | 'currentRound' | 'quantities' | 'unit' | 'void'
  >,
  inspectionCase: QualityInboundCaseItem | null,
): string | null {
  if (source.void) return null;
  const received = readScopeQuantity(source.quantities.receivedQuantity);
  const inbound = readScopeQuantity(source.quantities.inboundQuantity);
  const returned = readScopeQuantity(source.quantities.returnedQuantity);
  const remaining = readScopeQuantity(source.quantities.unprocessedQuantity);
  if (
    received === null ||
    inbound === null ||
    returned === null ||
    remaining === null ||
    received - inbound - returned !== remaining
  )
    return null;
  if (
    inspectionCase?.status === 'reviewing' &&
    (inspectionCase.receiptLineId !== source.id ||
      inspectionCase.roundId !== source.currentRound.id ||
      inspectionCase.receiptRevisionId !== source.currentReceiptRevisionId ||
      readScopeQuantity(inspectionCase.coveredQuantity) !== remaining)
  )
    return null;
  return `实收 ${received} ${source.unit} − 已入库 ${inbound} ${source.unit} − 已退回 ${returned} ${source.unit}`;
}
