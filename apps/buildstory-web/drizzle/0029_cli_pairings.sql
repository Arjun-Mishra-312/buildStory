CREATE TABLE `buildstory_cli_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_code` text NOT NULL,
	`user_code_hash` text NOT NULL,
	`project_label` text NOT NULL,
	`narrative_mode` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`approved_at` text,
	`consumed_at` text,
	`grant_json` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_cli_pairings_user_code_hash` ON `buildstory_cli_pairings` (`user_code_hash`);
--> statement-breakpoint
CREATE INDEX `idx_buildstory_cli_pairings_expires` ON `buildstory_cli_pairings` (`expires_at`);
