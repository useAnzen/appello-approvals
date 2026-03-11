-- Backfill wp_status_history for existing work packages.
-- Inserts an initial "→ current_status" row using created_at as the timestamp.
-- Safe to run multiple times (skips work packages that already have history).

INSERT INTO wp_status_history (work_package_id, from_status, to_status, changed_at)
SELECT wp.id, NULL, wp.status, wp.created_at
FROM work_packages wp
WHERE NOT EXISTS (
    SELECT 1 FROM wp_status_history h WHERE h.work_package_id = wp.id
);
