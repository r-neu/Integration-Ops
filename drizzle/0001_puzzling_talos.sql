CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `demo_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`customer_id` text,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flow_jobs` (
	`flow_id` text NOT NULL,
	`job_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flow_mappings` (
	`flow_id` text NOT NULL,
	`mapping_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integration_flows` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`source_connection_id` text NOT NULL,
	`destination_connection_id` text NOT NULL,
	`source_object` text NOT NULL,
	`destination_object` text NOT NULL,
	`direction` text NOT NULL,
	`schedule` text NOT NULL,
	`status` text NOT NULL,
	`mapping_version` text NOT NULL,
	`schema_version` text NOT NULL,
	`retry_policy` text NOT NULL,
	`owner_team` text NOT NULL,
	`last_run_at` text NOT NULL,
	`next_run_at` text NOT NULL
);
