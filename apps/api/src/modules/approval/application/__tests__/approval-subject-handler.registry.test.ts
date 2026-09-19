import { describe, expect, it, vi } from 'vitest';
import type { ApprovalSubjectHandler } from '../approval-subject-handler.js';
import { ApprovalSubjectHandlerRegistry } from '../approval-subject-handler.registry.js';

const scene = {
  code: 'product.bom.approve',
  module: 'product',
  name: 'BOM 审批',
  description: 'BOM 审批测试场景',
  subjectType: 'product' as const,
  businessAssigneeSources: [],
  requiredFinalAssigneeSourceCode: null,
};

const handler = (overrides: Partial<ApprovalSubjectHandler> = {}) =>
  ({
    scene,
    sceneCode: scene.code,
    subjectType: scene.subjectType,
    lockCurrentApproval: vi.fn(),
    prepareForApproval: vi.fn(),
    bindApproval: vi.fn(),
    finalizeApproval: vi.fn(),
    restoreAfterApprovalEnd: vi.fn(),
    readSnapshotForDisplay: vi.fn(),
    ...overrides,
  }) as ApprovalSubjectHandler;

describe('ApprovalSubjectHandlerRegistry', () => {
  it('registers a typed scene and allows idempotent registration of the same instance', () => {
    const registry = new ApprovalSubjectHandlerRegistry();
    const subjectHandler = handler();

    registry.register(subjectHandler);
    registry.register(subjectHandler);

    expect(registry.listSceneDefinitions()).toEqual([scene]);
    expect(registry.getSceneDefinition(scene.code)).toBe(scene);
    expect(registry.getHandler(scene.code, 'product')).toBe(subjectHandler);
  });

  it('rejects a duplicate scene code mapped to another handler', () => {
    const registry = new ApprovalSubjectHandlerRegistry();
    registry.register(handler());

    expect(() => registry.register(handler())).toThrow('审批场景编码重复');
  });

  it('rejects a handler whose declared scene and sceneCode do not match', () => {
    const registry = new ApprovalSubjectHandlerRegistry();

    expect(() => registry.register(handler({ sceneCode: 'product.other.approve' }))).toThrow(
      '审批场景与处理能力不一致',
    );
  });

  it('fails closed for unknown scenes and object types', () => {
    const registry = new ApprovalSubjectHandlerRegistry();
    registry.register(handler());

    expect(() => registry.getSceneDefinition('unknown.scene')).toThrow('系统不支持该审批场景');
    expect(() => registry.getHandler('unknown.scene', 'product')).toThrow('未注册审批场景适配器');
    expect(() => registry.getHandler(scene.code, 'material' as never)).toThrow(
      '未注册审批场景适配器',
    );
  });
});
