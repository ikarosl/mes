import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { ProductionStepSopSnapshot } from '../application/ports/production-execution.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';

type StepSopSnapshotRow = RowDataPacket & {
  file_id: number | null;
  file_name: string | null;
  version_no: string | null;
  object_key: string | null;
};

export const selectProductionStepSopSnapshot = async (
  pool: Pool,
  batchId: string,
  stepRecordId: string,
  responsibleUserId?: string,
): Promise<ProductionStepSopSnapshot> => {
  const params: string[] = [batchId, stepRecordId];
  const assigneeCondition = responsibleUserId ? ' AND step.responsible_user_id=?' : '';
  if (responsibleUserId) params.push(responsibleUserId);
  const [[row]] = await pool.query<StepSopSnapshotRow[]>(
    `SELECT
       CASE WHEN step.actual_sop_object_key_snapshot IS NOT NULL
         THEN step.actual_sop_file_id ELSE step.sop_file_id_snapshot END file_id,
       CASE WHEN step.actual_sop_object_key_snapshot IS NOT NULL
         THEN step.actual_sop_file_name_snapshot ELSE step.sop_file_name_snapshot END file_name,
       CASE WHEN step.actual_sop_object_key_snapshot IS NOT NULL
         THEN step.actual_sop_version_no_snapshot ELSE step.sop_version_no_snapshot END version_no,
       CASE WHEN step.actual_sop_object_key_snapshot IS NOT NULL
         THEN step.actual_sop_object_key_snapshot ELSE step.sop_object_key_snapshot END object_key
     FROM batch_step_records step
     WHERE step.production_batch_id=? AND step.id=?${assigneeCondition}`,
    params,
  );
  if (!row)
    throw new ProductionDomainError(
      responsibleUserId ? 'NOT_STEP_ASSIGNEE' : 'NOT_FOUND',
      responsibleUserId ? '该工序未分配给当前员工' : '生产任务工序不存在',
    );
  if (row.file_id === null || !row.file_name || !row.version_no || !row.object_key)
    throw new ProductionDomainError('NOT_FOUND', '该生产任务工序没有可追溯的 SOP 快照');
  return {
    fileId: String(row.file_id),
    fileName: row.file_name,
    versionNo: row.version_no,
    objectKey: row.object_key,
  };
};
