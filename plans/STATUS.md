# Plan Inventory Status

> Updated: 2026-06-25

This file prevents the presence of old plan files from being interpreted as active Controller work.

- The target Controller Runtime architecture migration is completed and archived as `plan-20260625-target-runtime-architecture-completed.md`.
- Files already under `plans/archive/` are historical evidence.
- Top-level legacy `plan-*.md`, PRDs and Sprint files are preserved for compatibility and audit. They are **unclaimed** unless selected by an Issue/Task or the active-plan mechanism.
- An unclaimed plan does not create an `ExecutionJob`, consume a Worker slot, hold a Lease, or block release.
- Future plan closeout must update the owning Issue/Task and exact-revision Verification before archival.
