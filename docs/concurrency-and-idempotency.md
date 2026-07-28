# Concurrency and Idempotency Rules

Future mutable business documents must include an integer `version`, initially `0`. Repositories must update them atomically with the expected version:

```sql
UPDATE business_document
SET status = ?, version = version + 1, updated_by = ?
WHERE id = ? AND version = ?;
```

When no row is affected, return HTTP 409 with `CONCURRENT_MODIFICATION`.

Confirmation-style commands must carry a unique idempotency key. A repeat with the same normalized request returns the original result; a reused key with a different request returns HTTP 409 with `IDEMPOTENCY_CONFLICT`. Product and Identity are not retrofitted in this phase, and no future business tables are created.
