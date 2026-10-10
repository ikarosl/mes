import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  BatchStepAbnormalDispositionView,
  BatchStepReportItem,
  ProductionStepQuotaDistribution,
  ReworkRecordItem,
} from '@company/contracts';
import {
  calculateStepQuotaDistribution,
  type StepQuotaScrapFact,
} from '../domain/production-step-quota-distribution.policy.js';
import type { RouteStepQuantity } from '../domain/production-route-quantity.policy.js';
import { REPORT_FIELDS } from './mysql-production-reporting.persistence.js';
import {
  groupRowsBy,
  mapReport,
  type ProjectionStepRow,
  type ReportRow,
} from './mysql-production-reporting.projection.js';
import { mapRework, REWORK_COLUMNS, type ReworkRow } from './mysql-production-rework.projection.js';
import { selectStepDispositionViews } from './mysql-production-report-trace.read.js';

type ScrapRow = RowDataPacket & {
  id: number;
  production_batch_id: number;
  batch_step_record_id: number;
  abnormal_disposition_id: number;
  source_report_id: number;
  scrap_quantity: string;
  unit_snapshot: string;
};

export interface StepQuotaReadFacts {
  reports: BatchStepReportItem[];
  dispositions: BatchStepAbnormalDispositionView[];
  reworks: ReworkRecordItem[];
  scraps: StepQuotaScrapFact[];
}

/** 同一快照仅为已授权工序批量读四类事实，不按工序或返工层数追加查询。 */
export async function selectStepQuotaFacts(
  db: PoolConnection,
  stepRecordIds: readonly string[],
): Promise<StepQuotaReadFacts> {
  if (stepRecordIds.length === 0) return { reports: [], dispositions: [], reworks: [], scraps: [] };
  const placeholders = stepRecordIds.map(() => '?').join(',');
  const dispositions = await selectStepDispositionViews(db, stepRecordIds);
  const [reportRows] = await db.query<ReportRow[]>(
    `SELECT ${REPORT_FIELDS} FROM batch_step_reports r WHERE r.batch_step_record_id IN (${placeholders}) ORDER BY r.id`,
    [...stepRecordIds],
  );
  const [reworkRows] = await db.query<ReworkRow[]>(
    `SELECT ${REWORK_COLUMNS} FROM rework_records rw WHERE rw.batch_step_record_id IN (${placeholders}) ORDER BY rw.id`,
    [...stepRecordIds],
  );
  const [scrapRows] = await db.query<ScrapRow[]>(
    `SELECT id,production_batch_id,batch_step_record_id,abnormal_disposition_id,
      source_report_id,scrap_quantity,unit_snapshot
     FROM batch_step_scrap_records WHERE batch_step_record_id IN (${placeholders}) ORDER BY id`,
    [...stepRecordIds],
  );
  return {
    reports: reportRows.map((row) => mapReport(row)),
    dispositions,
    reworks: reworkRows.map(mapRework),
    scraps: scrapRows.map((row): StepQuotaScrapFact => ({
      scrapRecordId: String(row.id),
      productionBatchId: String(row.production_batch_id),
      stepRecordId: String(row.batch_step_record_id),
      dispositionId: String(row.abnormal_disposition_id),
      sourceReportId: String(row.source_report_id),
      quantity: String(row.scrap_quantity),
      unit: row.unit_snapshot,
    })),
  };
}

export function calculateStepQuotaDistributions(
  steps: ProjectionStepRow[],
  quantities: Map<string, RouteStepQuantity>,
  facts: StepQuotaReadFacts,
): Map<string, ProductionStepQuotaDistribution> {
  const reportsByStep = groupRowsBy(facts.reports, (row) => row.stepRecordId);
  const reworksByStep = groupRowsBy(facts.reworks, (row) => row.stepRecordId);
  const dispositionsByStep = groupRowsBy(facts.dispositions, (row) => row.stepRecordId);
  const scrapsByStep = groupRowsBy(facts.scraps, (row) => row.stepRecordId);
  return new Map(
    steps.map((step) => {
      const stepRecordId = String(step.id),
        quantity = quantities.get(stepRecordId)!;
      return [
        stepRecordId,
        calculateStepQuotaDistribution({
          productionBatchId: String(step.production_batch_id),
          stepRecordId,
          unit: step.unit_snapshot,
          directReportedQuantity: String(step.effective_direct_reported),
          normalQuantity: String(step.effective_normal),
          upperLimitQuantity: quantity.upperLimitQuantity,
          availableQuantity: quantity.availableReportQuantity,
          reports: reportsByStep.get(stepRecordId) ?? [],
          dispositions: dispositionsByStep.get(stepRecordId) ?? [],
          reworks: reworksByStep.get(stepRecordId) ?? [],
          scraps: scrapsByStep.get(stepRecordId) ?? [],
        }),
      ];
    }),
  );
}
