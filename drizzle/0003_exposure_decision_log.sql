CREATE TABLE `demo_connector_dependencies` (
	`run_id` text NOT NULL,
	`id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`tenant_name` text NOT NULL,
	`workflow_id` text NOT NULL,
	`workflow_name` text NOT NULL,
	`provider` text NOT NULL,
	`connector_family` text NOT NULL,
	`connector_version` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`endpoints_json` text NOT NULL,
	`enabled` integer NOT NULL,
	`metadata_status` text NOT NULL,
	`last_verified_at` text NOT NULL,
	`next_run_at` text NOT NULL,
	`criticality` text NOT NULL,
	`config_revision` text NOT NULL,
	PRIMARY KEY(`run_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `demo_execution_events` (
	`run_id` text NOT NULL,
	`id` text NOT NULL,
	`incident_id` text,
	`tenant_id` text NOT NULL,
	`dependency_id` text NOT NULL,
	`provider` text NOT NULL,
	`connector_family` text NOT NULL,
	`connector_version` text NOT NULL,
	`capability` text NOT NULL,
	`endpoint` text NOT NULL,
	`error_code` text,
	`trace_id` text NOT NULL,
	`span_id` text NOT NULL,
	`status` text NOT NULL,
	`observed_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `demo_incident_fingerprints` (
	`run_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`classification` text NOT NULL,
	`method` text NOT NULL,
	`provider` text NOT NULL,
	`connector_family` text NOT NULL,
	`connector_version` text NOT NULL,
	`capability` text NOT NULL,
	`endpoint` text NOT NULL,
	`error_code` text NOT NULL,
	`vulnerable_version_range` text NOT NULL,
	`correlation_window_minutes` integer NOT NULL,
	`observed_at` text NOT NULL,
	`source_event_ids_json` text NOT NULL,
	`correlated_failure_count` integer NOT NULL,
	`correlated_tenant_count` integer NOT NULL,
	PRIMARY KEY(`run_id`, `incident_id`)
);
--> statement-breakpoint
CREATE TABLE `demo_exposure_decisions` (
	`run_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`dependency_snapshot_version` text NOT NULL,
	`input_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`evaluation_mode` text NOT NULL,
	`result_json` text NOT NULL,
	PRIMARY KEY(`run_id`, `decision_id`),
	UNIQUE(`run_id`, `incident_id`)
);
--> statement-breakpoint
CREATE INDEX `demo_dependencies_tenant_idx`
	ON `demo_connector_dependencies` (`run_id`, `tenant_id`);
--> statement-breakpoint
CREATE INDEX `demo_events_correlation_idx`
	ON `demo_execution_events` (`run_id`, `provider`, `connector_family`, `observed_at`);
--> statement-breakpoint
CREATE INDEX `demo_decisions_incident_idx`
	ON `demo_exposure_decisions` (`run_id`, `incident_id`);
