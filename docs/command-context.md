# Command Context and Request IDs

Every HTTP command receives a `CommandContext` with `actorId`, `requestId`, `ip`, `userAgent`, and optional `idempotencyKey`. The request-context middleware accepts only a valid `X-Request-Id`; otherwise it generates a UUID and writes it to both the request and response.

Business write audits persist the request ID in the same transaction as the business write. Generic request, failure, and security-denial logs are best-effort and must never include passwords, tokens, cookies, signatures, credentials, or raw request bodies.

`operation_logs.request_id` is nullable for historical compatibility and indexed for investigation. It can be queried through the existing operation-log request-ID filter.
