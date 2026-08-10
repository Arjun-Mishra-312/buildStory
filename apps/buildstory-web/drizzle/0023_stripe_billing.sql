ALTER TABLE `buildstory_users` ADD `stripe_customer_id` text;
ALTER TABLE `buildstory_users` ADD `stripe_subscription_id` text;
ALTER TABLE `buildstory_users` ADD `subscription_status` text;
ALTER TABLE `buildstory_users` ADD `billing_interval` text;
ALTER TABLE `buildstory_users` ADD `current_period_end` text;
ALTER TABLE `buildstory_users` ADD `cancel_at_period_end` integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX `idx_buildstory_users_stripe_customer_id` ON `buildstory_users` (`stripe_customer_id`);
