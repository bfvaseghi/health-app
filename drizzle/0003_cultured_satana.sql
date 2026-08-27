CREATE TABLE `baseline_owner` (
	`singleton` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_owner_user_id_unique` ON `baseline_owner` (`user_id`);--> statement-breakpoint
INSERT INTO `baseline_owner` (`singleton`, `user_id`, `created_at`)
SELECT 1, `user_id`, `created_at`
FROM (
	SELECT `user_id`, `updated_at` AS `created_at` FROM `health_states`
	UNION ALL
	SELECT `user_id`, `created_at` FROM `apple_health_syncs`
)
ORDER BY `created_at` ASC
LIMIT 1;--> statement-breakpoint
ALTER TABLE `apple_health_syncs` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `health_state_backups` ADD `replaced_revision` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `health_state_backups_user_revision_uidx` ON `health_state_backups` (`user_id`,`replaced_revision`);
