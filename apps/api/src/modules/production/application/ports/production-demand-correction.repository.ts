import type {
  DemandCorrectionCheck,
  DemandCorrectionHistoryItem,
  SubmitDemandCorrectionPayload,
} from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import type { ApprovalSubjectPreparation } from '../../../approval/public.js';

export abstract class ProductionDemandCorrectionRepository {
  abstract getCheck(demandId: string): Promise<DemandCorrectionCheck>;
  abstract listHistory(demandId: string): Promise<DemandCorrectionHistoryItem[]>;
  abstract createRequest(
    demandId: string,
    payload: SubmitDemandCorrectionPayload,
    context: CommandContext,
  ): Promise<string>;
  abstract prepare(
    id: string,
    version: number,
    context: CommandContext,
  ): Promise<ApprovalSubjectPreparation>;
  abstract bind(
    id: string,
    instanceId: string,
    version: number,
    context: CommandContext,
  ): Promise<number>;
  abstract lock(id: string, instanceId: string, version: number): Promise<void>;
  abstract finalize(
    id: string,
    instanceId: string,
    version: number,
    context: CommandContext,
  ): Promise<void>;
  abstract restore(
    id: string,
    instanceId: string,
    version: number,
    context: CommandContext,
  ): Promise<void>;
}
