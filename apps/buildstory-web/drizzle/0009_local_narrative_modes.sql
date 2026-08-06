ALTER TABLE `buildstory_upload_sessions` ADD `narrative_mode` text NOT NULL DEFAULT 'cloud';
ALTER TABLE `buildstory_narratives` ADD `fallbacks_used_json` text;
