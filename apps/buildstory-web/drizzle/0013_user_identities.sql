CREATE TABLE `buildstory_user_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_user_identities_provider_subject` ON `buildstory_user_identities` (`provider`,`subject`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_user_identities_user` ON `buildstory_user_identities` (`user_id`);--> statement-breakpoint
-- Backfill one identity row per existing user, parsed from their original auth_subject
-- ("<provider>:<subject>"). This is the row that will always resolve back to this user;
-- users.auth_subject itself is never migrated away from.
INSERT INTO `buildstory_user_identities` (`id`, `user_id`, `provider`, `subject`, `email`, `created_at`)
SELECT
  'idn_' || lower(hex(randomblob(16))),
  `id`,
  substr(`auth_subject`, 1, instr(`auth_subject`, ':') - 1),
  substr(`auth_subject`, instr(`auth_subject`, ':') + 1),
  `email`,
  `created_at`
FROM `buildstory_users`
WHERE instr(`auth_subject`, ':') > 0;