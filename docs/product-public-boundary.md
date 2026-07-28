# Product Public Boundary

`apps/api/src/modules/product/public.ts` exports `ProductSnapshotQuery` as the sole Product read boundary for future production orchestration.

It returns stable product, BOM, route, step and SOP snapshots only. BOM lines expose their Product-owned `productMaterialId`; route steps expose `routeStepId`, default owner and frozen SOP object key so production consumers do not query Product tables. Multi-query BOM and route snapshots are read in one database transaction.

The contract must not expose database rows, connections, pools, transaction executors, or storage SDK types. Consumers must not query Product-owned tables or import Product internals. Independent `sop_version_no_snapshot` storage and the process-step lifecycle redesign remain deferred in `docs/todo.md`; this boundary does not introduce that migration early.
