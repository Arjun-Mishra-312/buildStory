DROP TABLE IF EXISTS `buildstory_leaderboard_entries`;
--> statement-breakpoint
CREATE TABLE `buildstory_usage_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`day` text NOT NULL,
	`model_key` text NOT NULL,
	`model_label` text DEFAULT '' NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL,
	`cost_micro_usd` integer,
	`session_count` integer DEFAULT 0 NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `buildstory_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_usage_daily_project_day_model` ON `buildstory_usage_daily` (`project_id`,`day`,`model_key`);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_usage_daily_user_day` ON `buildstory_usage_daily` (`user_id`,`day`);
--> statement-breakpoint
CREATE TABLE `buildstory_leaderboard_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`user_id` text NOT NULL,
	`rank_spend` integer NOT NULL,
	`rank_tokens` integer NOT NULL,
	`spend_micro_usd` integer DEFAULT 0 NOT NULL,
	`priced` integer DEFAULT 0 NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL,
	`commit_count` integer DEFAULT 0 NOT NULL,
	`active_days` integer NOT NULL,
	`last_active_at` text,
	`session_count` integer DEFAULT 0 NOT NULL,
	`story_count` integer NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_leaderboard_period_user` ON `buildstory_leaderboard_entries` (`period`,`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_leaderboard_period_rank_spend` ON `buildstory_leaderboard_entries` (`period`,`rank_spend`);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_leaderboard_period_rank_tokens` ON `buildstory_leaderboard_entries` (`period`,`rank_tokens`);
