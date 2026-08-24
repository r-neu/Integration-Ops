CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` text NOT NULL,
	`job_id` text,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`provider` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`auth_status` text NOT NULL,
	`owner` text NOT NULL,
	`last_sync` text NOT NULL,
	`success_rate` integer NOT NULL,
	`open_failures` integer NOT NULL,
	`scopes` text NOT NULL,
	`next_action` text NOT NULL,
	`last_verified` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plan` text NOT NULL,
	`segment` text NOT NULL,
	`owner` text NOT NULL,
	`health` text NOT NULL,
	`health_score` integer NOT NULL,
	`open_failures` integer NOT NULL,
	`record_count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `field_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`related_job_id` text,
	`source_object` text NOT NULL,
	`source_field` text NOT NULL,
	`destination_field` text NOT NULL,
	`data_type` text NOT NULL,
	`required` integer NOT NULL,
	`confidence` integer NOT NULL,
	`status` text NOT NULL,
	`transform` text NOT NULL,
	`transform_options` text NOT NULL,
	`raw_sample` text NOT NULL,
	`cleaned_sample` text NOT NULL,
	`affected_records` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`provider` text NOT NULL,
	`object_type` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`processed` integer NOT NULL,
	`failed` integer NOT NULL,
	`skipped` integer NOT NULL,
	`checkpoint` text NOT NULL,
	`error_type` text,
	`summary` text NOT NULL,
	`action_state` text NOT NULL,
	`affected_record_ids` text NOT NULL,
	`retry_of` text
);
