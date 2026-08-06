CREATE TABLE `buildstory_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`repository_fingerprint` text NOT NULL,
	`fingerprint_basis` text NOT NULL,
	`first_scan_at` text NOT NULL,
	`last_scan_at` text NOT NULL,
	`story_count` integer DEFAULT 0 NOT NULL,
	`latest_session_count` integer DEFAULT 0 NOT NULL,
	`latest_commit_count` integer DEFAULT 0 NOT NULL,
	`latest_active_days` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`owner_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_projects_owner_fingerprint` ON `buildstory_projects` (`owner_user_id`,`repository_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_projects_owner_slug` ON `buildstory_projects` (`owner_user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_projects_owner_updated` ON `buildstory_projects` (`owner_user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `buildstory_users` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_subject` text NOT NULL,
	`email` text NOT NULL,
	`email_verified_at` text,
	`handle` text NOT NULL,
	`handle_lower` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`bio` text,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`follower_count` integer DEFAULT 0 NOT NULL,
	`following_count` integer DEFAULT 0 NOT NULL,
	`project_count` integer DEFAULT 0 NOT NULL,
	`story_count` integer DEFAULT 0 NOT NULL,
	`sessions_valid_after` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_users_auth_subject` ON `buildstory_users` (`auth_subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_users_handle_lower` ON `buildstory_users` (`handle_lower`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_buildstory_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`owner_user_id` text,
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
	FOREIGN KEY (`owner_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `buildstory_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`upload_session_id`) REFERENCES `buildstory_upload_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_buildstory_reports`("id", "creator_id", "owner_user_id", "project_id", "upload_session_id", "status", "created_at", "ready_at", "source_snapshot_json", "snapshot_json", "selected_public_fields_json", "editorial_tagline", "editorial_description", "editorial_reflection", "publication_status", "publication_slug", "published_at", "public_url", "updated_at") SELECT "id", "creator_id", NULL, "project_id", "upload_session_id", "status", "created_at", "ready_at", "source_snapshot_json", "snapshot_json", "selected_public_fields_json", "editorial_tagline", "editorial_description", "editorial_reflection", "publication_status", "publication_slug", "published_at", "public_url", "updated_at" FROM `buildstory_reports`;--> statement-breakpoint
DROP TABLE `buildstory_reports`;--> statement-breakpoint
ALTER TABLE `__new_buildstory_reports` RENAME TO `buildstory_reports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_buildstory_reports_creator_created` ON `buildstory_reports` (`creator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_reports_project` ON `buildstory_reports` (`creator_id`,`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_reports_published_slug` ON `buildstory_reports` (`publication_slug`) WHERE "buildstory_reports"."publication_status" = 'published';--> statement-breakpoint
ALTER TABLE `buildstory_upload_sessions` ADD `owner_user_id` text REFERENCES buildstory_users(id);
