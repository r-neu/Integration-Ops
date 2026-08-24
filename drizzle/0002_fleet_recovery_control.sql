CREATE TABLE IF NOT EXISTS `demo_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `demo_incident_state` (
	`run_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`status` text NOT NULL,
	`owner` text NOT NULL,
	`action_state` text NOT NULL,
	`step` integer NOT NULL,
	`current_value` text,
	`mapping_version` text NOT NULL,
	`connector_version` text NOT NULL,
	`resolution` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `incident_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `demo_scenario_clock` (
	`run_id` text PRIMARY KEY NOT NULL,
	`anchor_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `demo_job_attempts` (
	`run_id` text NOT NULL,
	`id` text NOT NULL,
	`incident_id` text NOT NULL,
	`flow_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`provider` text NOT NULL,
	`object_type` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`processed` integer NOT NULL,
	`failed` integer NOT NULL,
	`checkpoint` text NOT NULL,
	`summary` text NOT NULL,
	`retry_of` text NOT NULL,
	`idempotency_key` text NOT NULL,
	PRIMARY KEY(`run_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `demo_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`incident_id` text,
	`actor_role` text NOT NULL,
	`actor_label` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `demo_fleet_incident_state` (
	`run_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`recovery_owner` text NOT NULL,
	`communication_owner` text NOT NULL,
	`action_state` text NOT NULL,
	`detected_at` text NOT NULL,
	`acknowledged_at` text,
	`response_due_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `incident_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `demo_support_tasks` (
	`run_id` text NOT NULL,
	`id` text NOT NULL,
	`fleet_incident_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`tenant_name` text NOT NULL,
	`status` text NOT NULL,
	`assignee` text,
	`acknowledged_at` text,
	`last_update_at` text,
	`next_update_by` text,
	`resolved_at` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `id`),
	UNIQUE(`run_id`, `incident_id`, `tenant_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `demo_customer_communications` (
	`run_id` text NOT NULL,
	`id` text NOT NULL,
	`incident_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`tenant_name` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`impact` text NOT NULL,
	`customer_action` text NOT NULL,
	`recovery_owner` text NOT NULL,
	`posted_by` text NOT NULL,
	`posted_at` text NOT NULL,
	`next_update_by` text,
	PRIMARY KEY(`run_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `demo_quarantine_records` (
	`run_id` text NOT NULL,
	`id` text NOT NULL,
	`incident_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`source_record_id` text NOT NULL,
	`label` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`checkpoint` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`replay_attempt_id` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `id`),
	UNIQUE(`run_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `demo_release_state` (
	`run_id` text NOT NULL,
	`release_id` text NOT NULL,
	`status` text NOT NULL,
	`stage_index` integer NOT NULL,
	`required_healthy_runs` integer NOT NULL,
	`observed_healthy_runs` integer NOT NULL,
	`rollback_reason` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `release_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `demo_release_targets` (
	`run_id` text NOT NULL,
	`release_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`cohort` text NOT NULL,
	`active_version` text NOT NULL,
	`target_version` text NOT NULL,
	`rollout_status` text NOT NULL,
	`last_health_check` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `release_id`, `tenant_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `demo_activity_run_idx`
	ON `demo_activity` (`run_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `demo_support_tasks_queue_idx`
	ON `demo_support_tasks` (`run_id`, `status`, `next_update_by`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `demo_attempts_run_idx`
	ON `demo_job_attempts` (`run_id`, `incident_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `demo_attempts_idempotency_idx`
	ON `demo_job_attempts` (`run_id`, `idempotency_key`);
