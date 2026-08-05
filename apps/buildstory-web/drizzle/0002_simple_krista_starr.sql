CREATE TABLE `buildstory_llm_budgets` (
	`user_id` text NOT NULL,
	`period_key` text NOT NULL,
	`spent_micro_usd` integer DEFAULT 0 NOT NULL,
	`cap_micro_usd` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_llm_budgets_user_period` ON `buildstory_llm_budgets` (`user_id`,`period_key`);--> statement-breakpoint
CREATE TABLE `buildstory_narrative_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`narrative_id` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`lease_until` text,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`narrative_id`) REFERENCES `buildstory_narratives`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_narrative_jobs_narrative` ON `buildstory_narrative_jobs` (`narrative_id`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_narrative_jobs_dispatch` ON `buildstory_narrative_jobs` (`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `buildstory_narratives` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`mode` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text NOT NULL,
	`sections_json` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micro_usd` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `buildstory_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `buildstory_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_buildstory_narratives_report` ON `buildstory_narratives` (`report_id`);--> statement-breakpoint
CREATE INDEX `idx_buildstory_narratives_owner_created` ON `buildstory_narratives` (`owner_user_id`,`created_at`);