import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ApprovalSubjectHandlerRegistry,
  ApprovalSubjectError,
  type ApprovalSubjectHandler,
} from '../../approval/public.js';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { DEMAND_CORRECTION_APPROVAL_SCENE } from '../approval-scenes.js';
import { ProductionDemandCorrectionRepository } from './ports/production-demand-correction.repository.js';
import { ProductionDomainError } from '../domain/production.errors.js';
import { demandCorrectionSnapshotSchema } from './production-approval-snapshot.schema.js';

/** 只把 Production 拥有的业务命令注册给通用审批引擎。 */
@Injectable()
export class ProductionDemandCorrectionApprovalHandler
  implements ApprovalSubjectHandler, OnModuleInit
{
  readonly scene = DEMAND_CORRECTION_APPROVAL_SCENE;
  readonly sceneCode = this.scene.code;
  readonly subjectType = this.scene.subjectType;
  constructor(
    private readonly repository: ProductionDemandCorrectionRepository,
    private readonly registry: ApprovalSubjectHandlerRegistry,
  ) {}
  onModuleInit() {
    this.registry.register(this);
  }
  prepareForApproval(id: string, version: number, audit: CommandContext) {
    return productionApprovalCall(() => this.repository.prepare(id, version, audit));
  }
  bindApproval(id: string, instance: string, version: number, audit: CommandContext) {
    return productionApprovalCall(() => this.repository.bind(id, instance, version, audit));
  }
  lockCurrentApproval(id: string, instance: string, version: number) {
    return productionApprovalCall(() => this.repository.lock(id, instance, version));
  }
  finalizeApproval(id: string, instance: string, version: number, audit: CommandContext) {
    return productionApprovalCall(() => this.repository.finalize(id, instance, version, audit));
  }
  restoreAfterApprovalEnd(id: string, instance: string, version: number, audit: CommandContext) {
    return productionApprovalCall(() => this.repository.restore(id, instance, version, audit));
  }
  async readSnapshotForDisplay(snapshot: unknown, schemaVersion: number) {
    const parsed = demandCorrectionSnapshotSchema.safeParse(snapshot);
    if (schemaVersion !== 1 || !parsed.success)
      throw new ApprovalSubjectError('CONFLICT', '需求更正审批证据结构无法读取');
    return { subjectSnapshot: parsed.data, materialNames: {} };
  }
}
export async function productionApprovalCall<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ProductionDomainError)
      throw new ApprovalSubjectError(
        error.code === 'NOT_FOUND'
          ? 'NOT_FOUND'
          : error.code === 'INVALID_INPUT'
            ? 'INVALID_INPUT'
            : 'CONFLICT',
        error.message,
        error.details,
      );
    throw error;
  }
}
