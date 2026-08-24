CREATE TABLE `health_state_backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_state_backups_user_created_idx` ON `health_state_backups` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `health_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
