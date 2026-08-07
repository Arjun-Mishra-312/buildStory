CREATE TABLE `buildstory_report_media` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`kind` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `buildstory_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_report_media_report` ON `buildstory_report_media` (`report_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_report_media_owner` ON `buildstory_report_media` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `buildstory_reports` ADD `artifact_project_url` text;--> statement-breakpoint
ALTER TABLE `buildstory_reports` ADD `artifact_repo_url` text;--> statement-breakpoint
ALTER TABLE `buildstory_reports` ADD `artifact_video_url` text;