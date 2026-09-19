import type { ApprovalSceneDefinition } from './approval-scenes.js';
import type {
  ApprovalSubjectType,
  ApprovalSubjectSnapshot,
  ApprovalInstanceDetail,
} from '@company/contracts';
import type { CommandContext } from '../../../common/audit/audit.types.js';

export interface ApprovalBusinessAssigneeResolution {
  readonly sourceCode: string;
  readonly userId: string;
}

/**
 * 业务处理器返回的送审准备结果：记录绑定申请前的业务版本及受审快照。
 * 流程版本、审批角色及节点由 Approval 单独选取，不由业务处理器决定。
 */
export interface ApprovalSubjectPreparation {
  title: string;
  subjectVersion: number;
  snapshotSchemaVersion: number;
  snapshot: ApprovalSubjectSnapshot;
  businessAssigneeResolutions: readonly ApprovalBusinessAssigneeResolution[];
}

/**
 * 业务模块实现的审批适配契约；由 Registry.getHandler 获取实例后调用。
 * 写方法由 Approval 在事务内调用，实现方通过同池 withTransaction 复用事务上下文；
 * 接口不传连接或 SQL 类型，业务表仍由对象所有者负责写入。
 */
export interface ApprovalSubjectHandler {
  readonly scene: ApprovalSceneDefinition;
  readonly sceneCode: string;
  /** 决定前锁业务根并校验当前申请关联和冻结版本；本方法不批准业务对象。 */
  lockCurrentApproval(
    subjectId: string,
    instanceId: string,
    expectedVersion: number,
  ): Promise<void>;
  readonly subjectType: ApprovalSubjectType;
  /** 锁定并校验受审内容，返回绑定申请前的业务版本和受审快照。 */
  prepareForApproval(
    subjectId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<ApprovalSubjectPreparation>;
  /** 新申请创建后绑定到业务对象并冻结编辑，返回绑定后递增的业务版本。 */
  bindApproval(
    subjectId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<number>;
  /** 全部节点通过后，使业务结果最终生效；失败必须抛出以回滚本次决定。 */
  finalizeApproval(
    subjectId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void>;
  /** 驳回或撤回时解除送审冻结，不删除 Approval 保存的历史证据。 */
  restoreAfterApprovalEnd(
    subjectId: string,
    instanceId: string,
    expectedVersion: number,
    audit: CommandContext,
  ): Promise<void>;
  /** 解释本场景的历史证据结构并补充当前展示引用；不能改写已存证据。 */
  readSnapshotForDisplay(
    snapshot: unknown,
    schemaVersion: number,
  ): Promise<Pick<ApprovalInstanceDetail, 'subjectSnapshot' | 'materialNames'>>;
}

/** 业务适配器的公开失败契约，不暴露各模块内部 domain 异常。 */
export class ApprovalSubjectError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_INPUT',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
