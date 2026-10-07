PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`provider` text NOT NULL,
	`phone_number` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_seconds` integer,
	`recording_url` text,
	`transcript` text,
	`status` text NOT NULL,
	`raw_payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_calls`("id", "conversation_id", "provider", "phone_number", "started_at", "ended_at", "duration_seconds", "recording_url", "transcript", "status", "raw_payload", "created_at", "updated_at") SELECT "id", "conversation_id", "provider", "phone_number", "started_at", "ended_at", "duration_seconds", "recording_url", "transcript", "status", "raw_payload", "created_at", "updated_at" FROM `calls`;--> statement-breakpoint
DROP TABLE `calls`;--> statement-breakpoint
ALTER TABLE `__new_calls` RENAME TO `calls`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `calls_conversation_id_unique` ON `calls` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `calls_started_at_idx` ON `calls` (`started_at`);--> statement-breakpoint
CREATE INDEX `calls_status_idx` ON `calls` (`status`);--> statement-breakpoint
CREATE INDEX `calls_phone_number_idx` ON `calls` (`phone_number`);