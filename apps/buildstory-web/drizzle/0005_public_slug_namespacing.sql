ALTER TABLE `buildstory_reports` ADD `publication_path` text;
--> statement-breakpoint
UPDATE `buildstory_reports`
SET `publication_path` = (
  SELECT `handle_lower` || '/' || `publication_slug`
  FROM `buildstory_users`
  WHERE `buildstory_users`.`id` = `buildstory_reports`.`owner_user_id`
)
WHERE `owner_user_id` IS NOT NULL;
--> statement-breakpoint
DROP INDEX `idx_buildstory_reports_published_slug`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_reports_published_path` ON `buildstory_reports` (`publication_path`) WHERE `publication_status` = 'published';
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_reports_published_project` ON `buildstory_reports` (`project_id`) WHERE `publication_status` = 'published';
--> statement-breakpoint
CREATE INDEX `idx_buildstory_reports_legacy_slug` ON `buildstory_reports` (`publication_slug`) WHERE `published_at` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_buildstory_reports_published` ON `buildstory_reports` (`published_at`) WHERE `publication_status` = 'published';
