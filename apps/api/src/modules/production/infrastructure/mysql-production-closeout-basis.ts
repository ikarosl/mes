import type { PoolConnection } from 'mysql2/promise';

/** 根锁及审批冻结复核后调用；旧审批实例自身的冻结证据保持不可变。 */
export const invalidateUnapprovedCloseoutBasis = async (
  db: PoolConnection,
  batchId: string,
  actorId: string,
): Promise<void> => {
  await db.execute(
    `UPDATE production_batch_closeout c JOIN production_batches b ON b.id=c.production_batch_id
     SET c.review_snapshot=NULL,c.version=c.version+1,c.updated_by=?
     WHERE c.production_batch_id=? AND b.status='closing'
       AND c.current_revision_id IS NULL AND c.pending_approval_id IS NULL`,
    [actorId, batchId],
  );
};
