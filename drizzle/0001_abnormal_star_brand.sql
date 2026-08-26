CREATE TABLE `apple_health_syncs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_synced_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apple_health_syncs_token_hash_uidx` ON `apple_health_syncs` (`token_hash`);