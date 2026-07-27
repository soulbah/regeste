DROP INDEX `quota_usage_user_month`;--> statement-breakpoint
ALTER TABLE `quota_usage` ADD `day` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quota_usage` ADD `neurons` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `quota_usage_user_day` ON `quota_usage` (`user_id`,`day`);