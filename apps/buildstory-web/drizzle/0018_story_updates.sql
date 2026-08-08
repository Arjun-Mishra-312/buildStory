ALTER TABLE `buildstory_upload_sessions` ADD `target_project_id` text REFERENCES buildstory_projects(id);--> statement-breakpoint
ALTER TABLE `buildstory_reports` ADD `chapter_delta_json` text;
