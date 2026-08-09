ALTER TABLE `buildstory_upload_sessions` ADD `narrative_provider` text;
ALTER TABLE `buildstory_upload_sessions` ADD `analysis_tier` text NOT NULL DEFAULT 'standard';

ALTER TABLE `buildstory_narratives` ADD `reasoning_tokens` integer NOT NULL DEFAULT 0;
ALTER TABLE `buildstory_narratives` ADD `cached_tokens` integer NOT NULL DEFAULT 0;
ALTER TABLE `buildstory_narratives` ADD `analysis_tier_requested` text NOT NULL DEFAULT 'standard';
ALTER TABLE `buildstory_narratives` ADD `analysis_tier_delivered` text;
ALTER TABLE `buildstory_narratives` ADD `requested_provider` text;
ALTER TABLE `buildstory_narratives` ADD `requested_model` text;
ALTER TABLE `buildstory_narratives` ADD `provider_request_ids_json` text;
ALTER TABLE `buildstory_narratives` ADD `evidence_expires_at` text;
ALTER TABLE `buildstory_narratives` ADD `evidence_scrubbed_at` text;
ALTER TABLE `buildstory_narratives` ADD `evidence_receipt_json` text;
ALTER TABLE `buildstory_narratives` ADD `reservation_micro_usd` integer NOT NULL DEFAULT 0;

ALTER TABLE `buildstory_llm_budgets` ADD `reserved_micro_usd` integer NOT NULL DEFAULT 0;
