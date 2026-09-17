import type {
  ProductionOutputDetail,
  ProductionOutputCommandResult,
  SaveProductionOutputPayload,
  RecordProductionOutputInspectionPayload,
  SubmitProductionOutputPayload,
  BeginProductionOutputCorrectionPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type { ApprovalSubjectPreparation } from '../../../approval/public.js';
export abstract class ProductionOutputRepository {
  abstract detail(batchId: string): Promise<ProductionOutputDetail | null>;
  abstract saveDraft(
    batchId: string,
    payload: SaveProductionOutputPayload,
    context: CommandContext,
  ): Promise<ProductionOutputCommandResult>;
  abstract recordInspection(
    batchId: string,
    payload: RecordProductionOutputInspectionPayload,
    context: CommandContext,
  ): Promise<ProductionOutputCommandResult>;
  abstract beginCorrection(
    batchId: string,
    payload: BeginProductionOutputCorrectionPayload,
    context: CommandContext,
  ): Promise<ProductionOutputCommandResult>;
  abstract cancelCorrection(
    batchId: string,
    version: number,
    context: CommandContext,
  ): Promise<ProductionOutputCommandResult>;
  abstract validateSubmission(
    batchId: string,
    payload: SubmitProductionOutputPayload,
  ): Promise<string>;
  abstract prepare(
    id: string,
    version: number,
    context: CommandContext,
  ): Promise<ApprovalSubjectPreparation>;
  abstract bind(
    id: string,
    instance: string,
    version: number,
    context: CommandContext,
  ): Promise<number>;
  abstract lock(id: string, instance: string, version: number): Promise<void>;
  abstract finalize(
    id: string,
    instance: string,
    version: number,
    context: CommandContext,
  ): Promise<void>;
  abstract restore(
    id: string,
    instance: string,
    version: number,
    context: CommandContext,
  ): Promise<void>;
}
