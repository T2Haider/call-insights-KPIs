CREATE TABLE `ingestion_state` (
	`provider` text PRIMARY KEY NOT NULL,
	`last_received_at` integer,
	`last_rejected_at` integer,
	`last_reject_reason` text
);
