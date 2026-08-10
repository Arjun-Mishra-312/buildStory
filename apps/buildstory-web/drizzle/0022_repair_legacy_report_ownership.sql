-- Reports created before the durable user-id dual-write was introduced have
-- owner_user_id = NULL. The project is still the authoritative owner, so
-- restore the ownership link before owner-scoped private/public queries run.
UPDATE buildstory_reports
SET owner_user_id = (
  SELECT owner_user_id
  FROM buildstory_projects
  WHERE buildstory_projects.id = buildstory_reports.project_id
)
WHERE owner_user_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM buildstory_projects
    WHERE buildstory_projects.id = buildstory_reports.project_id
  );
--> statement-breakpoint

UPDATE buildstory_upload_sessions
SET owner_user_id = (
  SELECT owner_user_id
  FROM buildstory_reports
  WHERE buildstory_reports.upload_session_id = buildstory_upload_sessions.id
    AND buildstory_reports.owner_user_id IS NOT NULL
  LIMIT 1
)
WHERE owner_user_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM buildstory_reports
    WHERE buildstory_reports.upload_session_id = buildstory_upload_sessions.id
      AND buildstory_reports.owner_user_id IS NOT NULL
  );
--> statement-breakpoint

-- Rebuild missing canonical/archival paths from the current project namespace.
-- The highest chapter remains extensionless; older published chapters retain
-- their numbered path under the same current project slug.
UPDATE buildstory_reports
SET publication_path = (
  SELECT u.handle_lower || '/' || p.slug ||
    CASE
      WHEN buildstory_reports.chapter_index IS NOT NULL
       AND buildstory_reports.chapter_index < (
         SELECT MAX(previous.chapter_index)
         FROM buildstory_reports previous
         WHERE previous.project_id = buildstory_reports.project_id
           AND previous.publication_status IN ('published', 'draft_changes')
       )
      THEN '/' || buildstory_reports.chapter_index
      ELSE ''
    END
  FROM buildstory_projects p
  JOIN buildstory_users u ON u.id = p.owner_user_id
  WHERE p.id = buildstory_reports.project_id
)
WHERE publication_path IS NULL
  AND publication_status IN ('published', 'draft_changes')
  AND EXISTS (
    SELECT 1
    FROM buildstory_projects p
    WHERE p.id = buildstory_reports.project_id
  );
