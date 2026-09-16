import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ApprovalSubjectHandlerRegistry,
  type ApprovalSubjectHandler,
} from '../../approval/public.js';
import type { CommandContext } from '../../../common/audit/audit.types.js';
import { BATCH_CLOSEOUT_APPROVAL_SCENE } from '../approval-scenes.js';
import { ProductionCloseoutRepository } from './ports/production-closeout.repository.js';
import { productionApprovalCall } from './production-demand-correction-approval.handler.js';
import { readCloseoutApprovalSnapshot } from './production-approval-snapshot.schema.js';
@Injectable()
export class ProductionCloseoutApprovalHandler implements ApprovalSubjectHandler, OnModuleInit {
  readonly scene = BATCH_CLOSEOUT_APPROVAL_SCENE;
  readonly sceneCode = this.scene.code;
  readonly subjectType = this.scene.subjectType;
  constructor(
    private readonly repository: ProductionCloseoutRepository,
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
    return productionApprovalCall(async () => ({
      subjectSnapshot: readCloseoutApprovalSnapshot(snapshot, schemaVersion),
      materialNames: {},
    }));
  }
}
