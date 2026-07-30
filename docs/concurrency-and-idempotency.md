# 并发与幂等性规则

所有未来可变业务单据必须包含一个整数字段 `version`，初始值为 `0`。Repository 必须使用预期的版本号进行原子更新：

```sql
UPDATE business_document
SET status = ?, version = version + 1, updated_by = ?
WHERE id = ? AND version = ?;
```

当无行受影响时，持久化代码抛出协议无关的并发错误。HTTP 异常过滤器将其映射为 HTTP 409，错误码为 `CONCURRENT_MODIFICATION`。

确认类命令必须携带唯一的 `Idempotency-Key` HTTP 头，长度限制为 1 到 150 个字符。该键不应在请求体中重复携带。使用相同标准化请求重放时，返回原始结果；复用键但请求不同时，返回 HTTP 409，错误码为 `IDEMPOTENCY_CONFLICT`。Product 与 Identity 模块在本阶段不做改造。Production 第一阶段的 `production_item_demand` 使用 `NORMAL:{production_batch_id}:{product_material_id}` 作为内部稳定幂等键；后续确认、分配和库存流水命令仍必须使用 HTTP `Idempotency-Key`。
