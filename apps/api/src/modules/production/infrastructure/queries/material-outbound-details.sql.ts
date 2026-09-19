import { currentMaterialNameSql } from './material-name.sql.js';
export const materialOutboundDetailsSql = (
  ids: string[],
): string => `SELECT od.id,od.outbound_id,od.allocation_id,od.demand_id,od.item_id,od.material_variant_id,od.batch_id,ib.batch_code,
        ib.material_variant_code_snapshot,ib.item_code_snapshot,${currentMaterialNameSql('ib.item_id')} item_name,d.generation_group_key,d.demand_type generation_group_type,
        s.supplement_no,od.outbound_number,od.unit_snapshot,it.id inventory_transaction_id
       FROM outbound_detail od JOIN item_batch ib ON ib.id=od.batch_id
       JOIN production_item_demand d ON d.id=od.demand_id
       LEFT JOIN production_material_supplement s ON s.id=d.supplement_id
       LEFT JOIN inventory_transaction it ON it.reference_type='outbound_detail'
         AND it.reference_detail_id=od.id AND it.transaction_type='production_material_outbound'
       WHERE od.outbound_id IN (${ids.map(() => '?').join(',')}) ORDER BY od.outbound_id,od.id`;
