import type { RowDataPacket } from 'mysql2/promise';
import type { Db } from './mysql-production.shared.js';
import {
  evaluateSupplementFulfillment,
  type SupplementDemandRequirement,
} from '../domain/production-supplement-fulfillment.policy.js';

type RequirementRow = RowDataPacket & {
  id: string;
  business_status: SupplementDemandRequirement['status'];
  pending_correction_id: string | null;
  replaces_demand_id: string | null;
  close_cause: SupplementDemandRequirement['closeCause'];
  issued_quantity: string;
  correction_id: string | null;
  applied_at: Date | null;
  new_demand_id: string | null;
  target_total_quantity: string;
  correction_issued_quantity: string;
  new_remaining_quantity: string;
};

export async function loadSupplementRequirements(
  db: Db,
  supplementId: string,
  lock = false,
): Promise<SupplementDemandRequirement[]> {
  const [rows] = await db.query<RequirementRow[]>(
    `SELECT d.id,d.business_status,d.pending_correction_id,d.replaces_demand_id,d.close_cause,
      d.need_number-d.remaining_number issued_quantity,c.id correction_id,c.applied_at,c.new_demand_id,
      c.target_total_quantity,c.issued_quantity correction_issued_quantity,c.new_remaining_quantity
     FROM production_item_demand d LEFT JOIN production_demand_correction c ON c.id=d.close_correction_id AND c.old_demand_id=d.id
     WHERE d.supplement_id=? ORDER BY d.id${lock ? ' FOR SHARE' : ''}`,
    [supplementId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    status: row.business_status,
    pendingCorrectionId:
      row.pending_correction_id === null ? null : String(row.pending_correction_id),
    replacesDemandId: row.replaces_demand_id === null ? null : String(row.replaces_demand_id),
    closeCause: row.close_cause,
    issuedQuantity: Number(row.issued_quantity),
    correction:
      row.correction_id === null
        ? null
        : {
            applied: row.applied_at !== null,
            newDemandId: row.new_demand_id === null ? null : String(row.new_demand_id),
            targetTotalQuantity: Number(row.target_total_quantity),
            issuedQuantity: Number(row.correction_issued_quantity),
            newRemainingQuantity: Number(row.new_remaining_quantity),
          },
  }));
}
export async function supplementFulfillment(db: Db, supplementId: string) {
  return evaluateSupplementFulfillment(await loadSupplementRequirements(db, supplementId, true));
}
