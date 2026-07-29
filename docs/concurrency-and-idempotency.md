# Concurrency and Idempotency Rules

Future mutable business documents must include an integer `version`, initially `0`. Repositories must update them atomically with the expected version:

```sql
UPDATE business_document
SET status = ?, version = version + 1, updated_by = ?
WHERE id = ? AND version = ?;
```

When no row is affected, persistence code throws a protocol-independent concurrency error. The HTTP exception filter maps it to HTTP 409 with `CONCURRENT_MODIFICATION`.

Confirmation-style commands must carry a unique `Idempotency-Key` HTTP header with 1 to 150 characters. The key is not duplicated in the body. A repeat with the same normalized request returns the original result; a reused key with a different request returns HTTP 409 with `IDEMPOTENCY_CONFLICT`. Product and Identity are not retrofitted in this phase. Production 第一阶段的 `production_item_demand` 使用 `NORMAL:{production_batch_id}:{product_material_id}` 作为内部稳定幂等键；后续确认、分配和库存流水命令仍必须使用 HTTP `Idempotency-Key`。
