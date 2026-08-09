ALTER TABLE `buildstory_users` ADD `builder_role` text;
--> statement-breakpoint
ALTER TABLE `buildstory_users` ADD `onboarding_completed_at` text;
--> statement-breakpoint
UPDATE `buildstory_users`
SET `onboarding_completed_at` = datetime('now')
WHERE `onboarding_completed_at` IS NULL AND `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TABLE `buildstory_user_guidance` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`guide_key` text NOT NULL,
	`guide_version` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_user_guidance_user_key_version` ON `buildstory_user_guidance` (`user_id`,`guide_key`,`guide_version`);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_user_guidance_user` ON `buildstory_user_guidance` (`user_id`);
