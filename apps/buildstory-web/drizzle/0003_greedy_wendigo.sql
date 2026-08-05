CREATE TABLE `buildstory_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`parent_comment_id` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'visible' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `buildstory_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_comments_report_created` ON `buildstory_comments` (`report_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_comments_parent` ON `buildstory_comments` (`parent_comment_id`);--> statement-breakpoint
CREATE TABLE `buildstory_content_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason_code` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`reporter_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_content_reports_status_created` ON `buildstory_content_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_content_reports_target` ON `buildstory_content_reports` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `buildstory_follows` (
	`id` text PRIMARY KEY NOT NULL,
	`follower_user_id` text NOT NULL,
	`followee_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`follower_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`followee_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_follows_pair` ON `buildstory_follows` (`follower_user_id`,`followee_user_id`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_follows_followee_created` ON `buildstory_follows` (`followee_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_follows_follower_created` ON `buildstory_follows` (`follower_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `buildstory_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`report_id` text,
	`comment_id` text,
	`read_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`report_id`) REFERENCES `buildstory_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_notifications_user_created` ON `buildstory_notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_notifications_dedup` ON `buildstory_notifications` (`user_id`,`kind`,`actor_user_id`,`report_id`);--> statement-breakpoint
CREATE TABLE `buildstory_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`window_start` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_rate_limits_window` ON `buildstory_rate_limits` (`window_start`);--> statement-breakpoint
CREATE TABLE `buildstory_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `buildstory_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_reactions_report_user` ON `buildstory_reactions` (`report_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_reactions_report_kind` ON `buildstory_reactions` (`report_id`,`kind`);