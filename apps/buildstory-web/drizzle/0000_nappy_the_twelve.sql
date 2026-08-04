CREATE TABLE `buildstory_report_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`lease_until` text,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `buildstory_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_jobs_report` ON `buildstory_report_jobs` (`report_id`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_jobs_dispatch` ON `buildstory_report_jobs` (`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `buildstory_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`project_id` text NOT NULL,
	`upload_session_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`ready_at` text,
	`source_snapshot_json` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`selected_public_fields_json` text NOT NULL,
	`editorial_tagline` text NOT NULL,
	`editorial_description` text NOT NULL,
	`editorial_reflection` text NOT NULL,
	`publication_status` text NOT NULL,
	`publication_slug` text NOT NULL,
	`published_at` text,
	`public_url` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`upload_session_id`) REFERENCES `buildstory_upload_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_reports_creator_created` ON `buildstory_reports` (`creator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_reports_project` ON `buildstory_reports` (`creator_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_reports_published_slug` ON `buildstory_reports` (`publication_slug`) WHERE "buildstory_reports"."publication_status" = 'published';--> statement-breakpoint
CREATE TABLE `buildstory_upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`project_label` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`scanner_authorized_at` text,
	`snapshot_received_at` text,
	`report_id` text,
	`status_detail` text NOT NULL,
	`device_code_hash` text NOT NULL,
	`device_code_claimed_at` text,
	`connection_id` text,
	`upload_token_hash` text,
	`upload_token_expires_at` text,
	`upload_token_consumed_at` text,
	`upload_receipt_id` text,
	`snapshot_digest` text,
	`snapshot_json` text,
	`queued_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_sessions_creator_created` ON `buildstory_upload_sessions` (`creator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_sessions_status` ON `buildstory_upload_sessions` (`status`);