import '../../../apps/api/node_modules/reflect-metadata';
import {
  BadRequestException,
  type ExecutionContext,
} from '../../../apps/api/node_modules/@nestjs/common';
import { Reflector } from '../../../apps/api/node_modules/@nestjs/core';
import { describe, expect, it } from 'vitest';
import { IdempotencyKeyGuard } from '../../../apps/api/src/infrastructure/idempotency/idempotency-key.guard.js';
import { ProductionController } from '../../../apps/api/src/modules/production/presentation/http/production.controller.js';

describe('createBatch idempotency guard', () => {
  // TODO(create-batch-closed-loop): 验证草稿创建及独立下达各自与幂等结果、成功审计同事务提交，同键重放不新增写入。
  // 创建核对自动编号与路线引用，下达核对路线工序快照只生成一次；冻结响应遵守 12 小时重放窗口，不改 BOM 批准事实或重复生成审批审计。
  // 高重要性：事务原子性和幂等；旧夹具缺少任务负责人场景资格，当前暂停。
  // 用户明确授权正式测试后，以合格任务负责人、草稿路线引用及下达批准依据重建夹具并恢复真实 MySQL 闭环。

  // TODO(create-batch-closed-loop): 验证业务失败整体回滚任务、幂等记录、成功审计及编号分配。
  // 下达失败保留草稿且不生成工序，已批准 BOM 的状态、版本和永久锁定事实保持原样；超工单计划仅提示，不恢复旧容量拒绝断言。
  // 高重要性：事务回滚和编号一致性；旧创建即冻结工序及容量失败旅程已退役，正式测试暂未授权。
  // 用户明确授权正式测试后，以当前资格或版本冲突等有效失败边界恢复真实 MySQL 回滚断言。

  it('IdempotencyKeyGuard 门禁（直接调用 canActivate）：已启用端点缺少 Idempotency-Key 返回 400，合法键放行', () => {
    const guard = new IdempotencyKeyGuard(new Reflector());

    expect(() => guard.canActivate(guardContext({}))).toThrow(BadRequestException);
    expect(guard.canActivate(guardContext({ 'idempotency-key': 'valid-key' }))).toBe(true);
  });
});

/** 用真实 Controller handler 读取 @IdempotentEndpoint() 元数据的 Guard 执行上下文。 */
const guardContext = (headers: Record<string, string | undefined>): ExecutionContext =>
  ({
    getHandler: () => ProductionController.prototype.createBatch,
    getClass: () => ProductionController,
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  }) as unknown as ExecutionContext;
