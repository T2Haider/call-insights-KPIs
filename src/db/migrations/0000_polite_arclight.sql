CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`provider` text NOT NULL,
	`phone_number` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`recording_url` text,
	`transcript` text,
	`status` text NOT NULL,
	`raw_payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calls_conversation_id_unique` ON `calls` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `calls_started_at_idx` ON `calls` (`started_at`);--> statement-breakpoint
CREATE INDEX `calls_status_idx` ON `calls` (`status`);--> statement-breakpoint
CREATE INDEX `calls_phone_number_idx` ON `calls` (`phone_number`);--> statement-breakpoint
CREATE TABLE `poller_state` (
	`provider` text PRIMARY KEY NOT NULL,
	`cursor` text,
	`last_success_at` integer,
	`last_error` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL
);
