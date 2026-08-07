DROP INDEX `idx_buildstory_reports_published_project`;--> statement-breakpoint
ALTER TABLE `buildstory_reports` ADD `chapter_index` integer;--> statement-breakpoint
CREATE INDEX `idx_buildstory_reports_project_chapter` ON `buildstory_reports` (`project_id`,`chapter_index`);--> statement-breakpoint
-- Backfill: every report that was already published under the old one-report-per-project
-- model becomes chapter 1 of its project (there can be at most one per project until now).
UPDATE `buildstory_reports` SET `chapter_index` = 1 WHERE `publication_status` = 'published';