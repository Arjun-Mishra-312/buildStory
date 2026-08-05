CREATE TABLE `buildstory_leaderboard_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`user_id` text NOT NULL,
	`rank` integer NOT NULL,
	`score` integer NOT NULL,
	`active_days` integer NOT NULL,
	`story_count` integer NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_leaderboard_period_user` ON `buildstory_leaderboard_entries` (`period`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_leaderboard_period_rank` ON `buildstory_leaderboard_entries` (`period`,`rank`);--> statement-breakpoint
CREATE TABLE `buildstory_leaderboard_runs` (
	`period` text PRIMARY KEY NOT NULL,
	`computed_at` text NOT NULL
);
