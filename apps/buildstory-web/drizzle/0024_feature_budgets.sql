CREATE TABLE `buildstory_feature_budgets` (
	`user_id` text NOT NULL,
	`period_key` text NOT NULL,
	`feature` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_feature_budgets_user_period_feature` ON `buildstory_feature_budgets` (`user_id`,`period_key`,`feature`);
--> statement-breakpoint
CREATE TABLE `buildstory_report_highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `buildstory_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_report_highlights_expires` ON `buildstory_report_highlights` (`expires_at`);
