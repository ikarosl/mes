# Product Public Boundary

`apps/api/src/modules/product/public.ts` exports `ProductSnapshotQuery` as the sole Product read boundary for future production orchestration.

It returns stable product, BOM, route, step and SOP snapshots only. The contract must not expose database rows, connections, pools, transaction executors, or storage SDK types. Consumers must not query Product-owned tables or import Product internals.
