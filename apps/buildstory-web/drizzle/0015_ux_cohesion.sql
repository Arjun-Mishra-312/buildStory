ALTER TABLE `buildstory_reports` ADD `category` text;
CREATE TABLE `buildstory_comment_upvotes` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `buildstory_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_comment_upvotes_comment_user` ON `buildstory_comment_upvotes` (`comment_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_comment_upvotes_comment_created` ON `buildstory_comment_upvotes` (`comment_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `buildstory_public_story_index` (
	`report_id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`search_text` text NOT NULL,
	`has_live_demo` integer NOT NULL DEFAULT 0,
	`cover_url` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `buildstory_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_public_story_index_category` ON `buildstory_public_story_index` (`category`);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_public_story_index_demo` ON `buildstory_public_story_index` (`has_live_demo`);
--> statement-breakpoint
CREATE TABLE `buildstory_public_story_facets` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`kind` text NOT NULL,
	`facet_key` text NOT NULL,
	`label` text NOT NULL,
	`weight` integer NOT NULL DEFAULT 1,
	FOREIGN KEY (`report_id`) REFERENCES `buildstory_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_public_story_facets_report_kind_key` ON `buildstory_public_story_facets` (`report_id`,`kind`,`facet_key`);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_public_story_facets_kind_key` ON `buildstory_public_story_facets` (`kind`,`facet_key`);
