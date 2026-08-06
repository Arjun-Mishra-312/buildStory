CREATE TABLE `buildstory_content_report_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `buildstory_content_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_content_report_audit_report` ON `buildstory_content_report_audit` (`report_id`,`created_at`);