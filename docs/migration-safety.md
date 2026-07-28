# Migration Safety

The migration runner takes the MySQL advisory lock `company_mes_migration` on one dedicated connection before reading checksums or applying SQL. It releases the lock in `finally`, including when a migration fails. Each migration is recorded only after its SQL succeeds.

Migrations remain append-only. Fresh verification applies migrations to a clean MySQL 8.4 database, runs the command again to prove idempotent pending-state handling, and checks migration status. Upgrade and concurrent-migrator integration tests remain the next required test-environment milestone; the untracked `packages/database/test_init` placeholder is not a substitute for them.
