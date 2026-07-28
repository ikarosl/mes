# Migration Safety

The migration runner takes the MySQL advisory lock `company_mes_migration` on one dedicated connection before reading checksums or applying SQL. It releases the lock in `finally`, including when a migration fails. Each migration is recorded only after its SQL succeeds.

Migrations remain append-only. Fresh verification applies migrations to a clean MySQL 8.4 database, runs the migration command a second time to prove idempotent pending-state handling, and fails status verification on pending or checksum-mismatched files. Upgrade and concurrent-migrator integration tests remain the next required test-environment milestone; `packages/database/test_init` records the separate future test-data initialization task and is not a substitute for them.
