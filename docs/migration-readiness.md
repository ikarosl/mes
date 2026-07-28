# Migration Readiness Gate

Before a production or inventory migration can be introduced, CI requires `pnpm migration:check`. The check rejects prohibited legacy models, unregistered tables, malformed up/down pairs and changes to historical migrations. Register data ownership, a public module boundary, optimistic-lock `version` rules for mutable documents, and idempotency rules for confirmation actions before adding a table to the approved migration scope; semantic business rules still require tests and review.

PR CI also runs format, documentation, architecture, migration-readiness, secret, dependency, build, type, unit and fresh-migration checks. Production and warehouse UI warnings are intentionally not a gate in this phase.
