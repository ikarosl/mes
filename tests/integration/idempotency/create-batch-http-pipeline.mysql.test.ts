import { it } from 'vitest';

// TODO(http-pipeline): 高重要性：真实认证、鉴权顺序、DTO、失败审计及 HTTP 幂等。
// 用户明确启动正式测试后，以现行必选路线和自动批号契约构造夹具恢复。
it.todo('未认证请求返回 401：AuthGuard 先于 IdempotencyKeyGuard 执行（带合法键也 401 而非 400）');
it.todo('认证但缺少 Idempotency-Key 返回 400 VALIDATION_ERROR，不落任何幂等记录');
it.todo(
  '成功：HTTP 201 + 批次落库 + completed 幂等记录 + 事务内成功审计；同键同 body 重放返回同一响应且不新增写入',
);
it.todo(
  '同键不同 body 返回 409 IDEMPOTENCY_CONFLICT，错误 envelope 形状完整且 AuditInterceptor 写入失败审计',
);
it.todo('DTO Pipe：带合法键但 body 非法（缺少 plannedQuantity）返回 400 VALIDATION_ERROR');
