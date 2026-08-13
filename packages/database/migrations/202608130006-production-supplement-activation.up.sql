ALTER TABLE production_material_supplement
  DROP CHECK chk_production_material_supplement_status,
  ADD COLUMN activated_at DATETIME NULL AFTER status,
  ADD COLUMN activated_by BIGINT UNSIGNED NULL AFTER activated_at,
  ADD KEY idx_production_material_supplement_activation (
    production_batch_id,
    status,
    batch_step_record_id
  ),
  ADD CONSTRAINT fk_production_material_supplement_activated_by FOREIGN KEY (activated_by)
    REFERENCES users(id),
  ADD CONSTRAINT chk_production_material_supplement_status
    CHECK (
      (
        status = 'approved'
        AND activated_at IS NULL
        AND activated_by IS NULL
      )
      OR
      (
        status = 'activated'
        AND activated_at IS NOT NULL
        AND activated_by IS NOT NULL
      )
    );

UPDATE production_material_supplement supplement
SET
  supplement.status = 'activated',
  supplement.activated_at = (
    SELECT MAX(outbound_order.outbound_at)
    FROM production_material_supplement_detail detail
    JOIN production_item_demand demand
      ON demand.source_supplement_detail_id = detail.id
      AND demand.demand_type = 'scrap_supplement'
      AND demand.business_status = 'active'
    JOIN outbound_detail outbound_detail ON outbound_detail.demand_id = demand.id
    JOIN outbound_order outbound_order
      ON outbound_order.id = outbound_detail.outbound_id
      AND outbound_order.status = 'completed'
    WHERE detail.supplement_id = supplement.id
  ),
  supplement.activated_by = COALESCE(
    (
      SELECT outbound_order.operator_id
      FROM production_material_supplement_detail detail
      JOIN production_item_demand demand
        ON demand.source_supplement_detail_id = detail.id
        AND demand.demand_type = 'scrap_supplement'
        AND demand.business_status = 'active'
      JOIN outbound_detail outbound_detail ON outbound_detail.demand_id = demand.id
      JOIN outbound_order outbound_order
        ON outbound_order.id = outbound_detail.outbound_id
        AND outbound_order.status = 'completed'
      WHERE detail.supplement_id = supplement.id
      ORDER BY outbound_order.outbound_at DESC, outbound_order.id DESC
      LIMIT 1
    ),
    supplement.created_by
  )
WHERE supplement.status = 'approved'
  AND EXISTS (
    SELECT 1
    FROM production_material_supplement_detail detail
    WHERE detail.supplement_id = supplement.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM production_material_supplement_detail detail
    LEFT JOIN production_item_demand demand
      ON demand.source_supplement_detail_id = detail.id
      AND demand.demand_type = 'scrap_supplement'
      AND demand.business_status = 'active'
    WHERE detail.supplement_id = supplement.id
      AND (
        demand.id IS NULL
        OR COALESCE(
          (
            SELECT SUM(outbound_detail.outbound_number)
            FROM outbound_detail outbound_detail
            JOIN outbound_order outbound_order
              ON outbound_order.id = outbound_detail.outbound_id
              AND outbound_order.status = 'completed'
            WHERE outbound_detail.demand_id = demand.id
          ),
          0
        ) < demand.need_number
      )
  );
