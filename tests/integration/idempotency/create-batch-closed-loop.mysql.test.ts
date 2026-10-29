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
  // TODO(create-batch-closed-loop): 验证任务、幂等结果与成功审计同事务提交，以及同键重放不新增写入。
  // 同时核对自动编号、路线工序快照、冻结响应与 12 小时重放窗口；任务创建不改已批准 BOM 或重复生成审批审计。
  // 高重要性：事务原子性和幂等；旧夹具缺少任务负责人场景资格，当前暂停。
  // 用户明确授权正式测试后，以合格任务负责人、显式路线及当前 BOM 结构重建夹具并恢复真实 MySQL 闭环。

  // TODO(create-batch-closed-loop): 验证业务失败整体回滚任务、幂等记录、成功审计及编号分配。
  // 容量失败后已批准 BOM 的状态、版本和永久锁定事实须保持原样。
  // 高重要性：事务回滚和编号一致性；旧夹具会先被任务负责人资格拒绝，无法到达容量失败边界。
  // 用户明确授权正式测试后，以合格任务负责人及当前生产定义重建夹具并恢复真实 MySQL 回滚断言。

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
