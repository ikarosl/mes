-- This migration reconciles mutable route-step state after the activation backfill in
-- 202608130004. Restoring completed state would discard production progress made after the
-- upgrade, so the data correction is intentionally not reversed.
SELECT 1;
