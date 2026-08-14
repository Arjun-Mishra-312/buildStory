CREATE TABLE `buildstory_badge_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`badge_id` text NOT NULL,
	`earned_at` text NOT NULL,
	`evidence_json` text NOT NULL,
	`source_project_id` text,
	`source_chapter_id` text,
	`pinned_rank` integer,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_project_id`) REFERENCES `buildstory_projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_badge_awards_user_badge` ON `buildstory_badge_awards` (`user_id`,`badge_id`);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_badge_awards_user` ON `buildstory_badge_awards` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_badge_awards_project` ON `buildstory_badge_awards` (`source_project_id`);
