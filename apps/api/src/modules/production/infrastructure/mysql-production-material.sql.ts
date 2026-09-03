/** 所有活动需求是否仍存在净有效分配缺口；仅接受受控 SQL 表达式。 */
export const activeDemandAllocationGapExistsSql = (batchIdExpression: '?' | 'b.id') => `EXISTS (
  SELECT 1 FROM production_item_demand demand
  WHERE demand.production_batch_id=${batchIdExpression} AND demand.business_status='active'
    AND COALESCE((
      SELECT SUM(GREATEST(allocation.assigned_number-COALESCE((
        SELECT SUM(return_detail.return_number)
        FROM return_detail
        JOIN return_order ON return_order.id=return_detail.return_id
        WHERE return_detail.allocation_id=allocation.id
          AND return_order.status='returned'
          AND return_detail.release_after_return=1
      ),0),0))
      FROM production_item_allocation allocation
      WHERE allocation.demand_id=demand.id
        AND allocation.allocation_status NOT IN ('released','cancelled')
    ),0)<demand.need_number
)`;

/** 当前活动需求的预计缺口是否超过同版本有效短批授权逐需求快照。 */
export const shortBatchAuthorizationCoverageInsufficientExistsSql = (
  batchIdExpression: 'b.id',
) => `EXISTS (
  SELECT 1
  FROM production_item_demand demand
  LEFT JOIN production_short_batch_authorization_detail authorization_detail
    ON authorization_detail.authorization_id=(
      SELECT authorization.id FROM production_short_batch_authorization authorization
      JOIN production_batches authorization_batch ON authorization_batch.id=authorization.production_batch_id
      WHERE authorization.production_batch_id=${batchIdExpression}
        AND authorization.status='active'
        AND authorization.material_plan_version=authorization_batch.material_plan_version
      ORDER BY authorization.id DESC LIMIT 1
    )
    AND authorization_detail.demand_id=demand.id
  WHERE demand.production_batch_id=${batchIdExpression} AND demand.business_status='active'
    AND GREATEST(demand.remaining_number-COALESCE((
      SELECT SUM(GREATEST(
        allocation.assigned_number
        - COALESCE((
          SELECT SUM(outbound_detail.outbound_number)
          FROM outbound_detail
          JOIN outbound_order ON outbound_order.id=outbound_detail.outbound_id
          WHERE outbound_detail.allocation_id=allocation.id AND outbound_order.status='completed'
        ),0)
        - COALESCE((
          SELECT SUM(return_detail.return_number)
          FROM return_detail
          JOIN return_order ON return_order.id=return_detail.return_id
          WHERE return_detail.allocation_id=allocation.id
            AND return_order.status='returned'
            AND return_detail.release_after_return=1
        ),0),0))
      FROM production_item_allocation allocation
      WHERE allocation.demand_id=demand.id
        AND allocation.allocation_status NOT IN ('released','cancelled')
    ),0),0) > COALESCE(authorization_detail.authorized_remaining_quantity,-1)
)`;
