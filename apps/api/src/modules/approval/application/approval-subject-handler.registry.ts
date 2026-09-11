import { ApprovalDomainError } from '../domain/approval.errors.js';
import type { ApprovalSceneDefinition } from './approval-scenes.js';
import { Injectable } from '@nestjs/common';
import type { ApprovalSubjectType } from '@company/contracts';
import type { ApprovalSubjectHandler } from './approval-subject-handler.js';

/** 内存中的场景能力目录：保存处理器实例，不写数据库；业务模块启动时注册。 */
@Injectable()
export class ApprovalSubjectHandlerRegistry {
  private readonly handlers = new Map<string, ApprovalSubjectHandler>();

  /** 同时登记场景定义和业务处理能力；只保存实例，不执行其审批方法。 */
  register(handler: ApprovalSubjectHandler): void {
    if (
      handler.scene.code !== handler.sceneCode ||
      handler.scene.subjectType !== handler.subjectType
    )
      throw new Error('审批场景与处理能力不一致');
    const existing = this.listSceneDefinitions().find((scene) => scene.code === handler.sceneCode);
    if (existing && this.handlers.get(this.key(existing.code, existing.subjectType)) !== handler)
      throw new Error('审批场景编码重复');
    const key = this.key(handler.sceneCode, handler.subjectType);
    const current = this.handlers.get(key);
    if (current && current !== handler)
      throw new Error(`审批场景适配器重复注册：${handler.sceneCode}/${handler.subjectType}`);
    this.handlers.set(key, handler);
  }

  /** 按场景与对象类型定位业务处理器，供审批编排调用对象所有者的操作。 */
  getHandler(sceneCode: string, subjectType: ApprovalSubjectType): ApprovalSubjectHandler {
    const handler = this.handlers.get(this.key(sceneCode, subjectType));
    if (!handler) throw new Error(`未注册审批场景适配器：${sceneCode}/${subjectType}`);
    return handler;
  }

  /** 提取代码声明的场景定义；不包含数据库中的流程步骤、角色或发布状态。 */
  listSceneDefinitions(): ApprovalSceneDefinition[] {
    return [...this.handlers.values()].map((handler) => handler.scene);
  }

  /** 确认场景已由代码注册；数据库存在同名配置不能替代业务能力的装配。 */
  getSceneDefinition(code: string): ApprovalSceneDefinition {
    const scene = this.listSceneDefinitions().find((item) => item.code === code);
    if (!scene) throw new ApprovalDomainError('NOT_FOUND', '系统不支持该审批场景');
    return scene;
  }

  private key(sceneCode: string, subjectType: ApprovalSubjectType): string {
    return `${sceneCode}\u0000${subjectType}`;
  }
}
