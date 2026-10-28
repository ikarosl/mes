import type {
  ProcurementInboundInspectionCaseSummary,
  ProcurementInboundInspectionLineItem,
} from '@company/contracts';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  RECEIPT_UNPROCESSED_QUANTITY,
  receiptPhysicalQuantityJoins,
} from './receipt-quantities.query.js';
import {
  type ReadRow,
  RECEIPT_LINE_FROM,
  RECEIPT_LIST_SOURCE_COLUMNS,
  mapReceiptListSource,
  slots,
  text,
} from './receipt-read.shared.js';

export const receiptInspectionStage = (unprocessedQuantity: string): string => `CASE
  WHEN r.is_voided=1 OR current_round.status='voided' THEN 'voided'
  WHEN ${unprocessedQuantity}=0 THEN 'completed'
  WHEN current_round.trigger_type='manual_rejection' THEN 'manual_rejection'
  ELSE current_round.status END`;

/** Read only the bounded selected rows, never complete inspection facts or historical collections. */
export async function readInspectionWorklistRows(db: Db, ids: string[]) {
  const result = new Map<string, ProcurementInboundInspectionLineItem>();
  if (!ids.length) return result;
  const [rows] = await db.query<ReadRow[]>(
    `SELECT ${RECEIPT_LIST_SOURCE_COLUMNS},line.id,
      current_round.id active_round_id,current_round.round_no active_round_no,
      current_round.status active_round_status,current_round.trigger_type active_round_trigger_type,
      ${receiptInspectionStage(RECEIPT_UNPROCESSED_QUANTITY)} stage,
      CASE WHEN r.is_voided=1 THEN 0 ELSE ${RECEIPT_UNPROCESSED_QUANTITY} END unprocessed_quantity,
      current_case.id case_id,current_case.incoming_round_id case_round_id,current_case.status case_status,
      source_round.round_no case_round_no,
      adopted_record.id adopted_inspection_id,adopted_record.release_decision
    ${RECEIPT_LINE_FROM}
    JOIN materials material ON material.id=line.item_id
    JOIN procurement_receipt_round current_round
      ON current_round.id=line.current_round_id AND current_round.receipt_line_id=line.id
    ${receiptPhysicalQuantityJoins(ids)}
    LEFT JOIN quality_inspection_record adopted_record
      ON adopted_record.id=current_round.inspection_id AND adopted_record.receipt_line_id=line.id
    LEFT JOIN quality_inspection_case current_case
      ON current_case.receipt_line_id=line.id AND current_case.source_kind='incoming'
      AND (current_case.id=adopted_record.case_id OR
        (adopted_record.id IS NULL AND current_case.incoming_round_id=current_round.id AND current_case.status='reviewing'))
    LEFT JOIN procurement_receipt_round source_round
      ON source_round.id=current_case.incoming_round_id AND source_round.receipt_line_id=line.id
    WHERE line.id IN (${slots(ids)})`,
    [...ids, ...ids, ...ids],
  );
  for (const row of rows) {
    const currentCase = mapCurrentInspectionCase(row);
    result.set(text(row.id), {
      ...mapReceiptListSource(row),
      receiptLineId: text(row.id),
      stage: row.stage as ProcurementInboundInspectionLineItem['stage'],
      currentRound: {
        roundNo: Number(row.active_round_no),
        status:
          row.active_round_status as ProcurementInboundInspectionLineItem['currentRound']['status'],
        triggerType:
          row.active_round_trigger_type as ProcurementInboundInspectionLineItem['currentRound']['triggerType'],
      },
      quantities: { unprocessedQuantity: String(Number(row.unprocessed_quantity)) },
      currentCase,
      currentCaseRoundNo: currentCase === null ? null : Number(row.case_round_no),
      isInherited:
        currentCase?.inspection != null && text(row.case_round_id) !== text(row.active_round_id),
    });
  }
  return result;
}

function mapCurrentInspectionCase(row: ReadRow): ProcurementInboundInspectionCaseSummary | null {
  if (row.case_id == null) return null;
  return {
    id: text(row.case_id),
    status: row.case_status as ProcurementInboundInspectionCaseSummary['status'],
    inspection:
      row.adopted_inspection_id == null
        ? null
        : {
            id: text(row.adopted_inspection_id),
            releaseDecision: row.release_decision as NonNullable<
              ProcurementInboundInspectionCaseSummary['inspection']
            >['releaseDecision'],
          },
  };
}
