import type { ProcurementInboundInspectionDetail } from '@company/contracts';
import type { QualityInboundQuery } from '../../../quality/public.js';
import { ProcurementDomainError } from '../../domain/procurement.errors.js';
import type { Db } from '../mysql-purchase-order.shared.js';
import {
  type ReadRow,
  lineSelect,
  readCurrentRounds,
  mapRound,
  text,
  nullableText,
} from './receipt-read.shared.js';
import { readReceiptPhysicalQuantities } from './receipt-quantities.query.js';

export async function readInspectionReceiptLine(
  db: Db,
  quality: QualityInboundQuery,
  id: string,
): Promise<ProcurementInboundInspectionDetail> {
  const [[row]] = await db.query<ReadRow[]>(
    `${lineSelect(`line.id,line.receipt_id,r.receipt_no,po.purchase_no,line.purchase_order_line_id,
      line.line_no,pol.item_code_snapshot,material.material_name,pol.material_variant_code_snapshot,
      pol.unit_snapshot,line.supplier_batch_code,supplier.supplier_name,
      line.current_receipt_revision_id,line.version`)} WHERE line.id=?`,
    [id],
  );
  if (!row) throw new ProcurementDomainError('RECEIPT_NOT_FOUND', '到货明细不存在');
  const currentRound = (await readCurrentRounds(db, [id])).get(id);
  if (!currentRound) throw new Error('到货明细缺少当前处理轮次');
  // 显式采用的旧轮检验不能受历史分页窗口影响。
  const [references] = await db.query<ReadRow[]>(
    `SELECT q.id,q.incoming_round_id,source.round_no FROM quality_inspection_case q
      JOIN procurement_receipt_round source ON source.id=q.incoming_round_id AND source.receipt_line_id=q.receipt_line_id
      WHERE q.receipt_line_id=? AND q.source_kind='incoming' AND
        ((q.incoming_round_id=? AND q.status='reviewing') OR EXISTS(
          SELECT 1 FROM quality_inspection_record record WHERE record.id=? AND record.case_id=q.id))
      ORDER BY q.id`,
    [id, currentRound.id, currentRound.inspection_id],
  );
  const cases = await quality.getCases(references.map((reference) => text(reference.id)));
  const quantities = (await readReceiptPhysicalQuantities(db, [id])).get(id)!;
  return {
    id: text(row.id),
    receiptId: text(row.receipt_id),
    receiptNo: text(row.receipt_no),
    purchaseNo: text(row.purchase_no),
    purchaseOrderLineId: text(row.purchase_order_line_id),
    lineNo: Number(row.line_no),
    itemCode: text(row.item_code_snapshot),
    itemName: text(row.material_name),
    materialVariantCode: text(row.material_variant_code_snapshot),
    unit: text(row.unit_snapshot),
    supplierName: text(row.supplier_name),
    supplierBatchCode: nullableText(row.supplier_batch_code),
    version: Number(row.version),
    currentReceiptRevisionId: text(row.current_receipt_revision_id),
    currentRound: mapRound(currentRound),
    quantities: {
      receivedQuantity: quantities.receivedQuantity,
      inboundQuantity: quantities.inboundQuantity,
      returnedQuantity: quantities.returnedQuantity,
      unprocessedQuantity: quantities.unprocessedQuantity,
    },
    cases,
    rounds: references.map((reference) => ({
      id: text(reference.incoming_round_id),
      roundNo: Number(reference.round_no),
    })),
  };
}
