CREATE TABLE `demo_evidence_probes` (
	`run_id` text NOT NULL,
	`id` text NOT NULL,
	`incident_id` text NOT NULL,
	`dependency_id` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer NOT NULL,
	`source` text NOT NULL,
	`trace_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` text NOT NULL,
	`completed_at` text,
	`failure_reason` text,
	`result_json` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `demo_health_gate_evidence` (
	`run_id` text NOT NULL,
	`id` text NOT NULL,
	`release_id` text NOT NULL,
	`cohort` text NOT NULL,
	`run_number` integer NOT NULL,
	`tenant_ids_json` text NOT NULL,
	`status` text NOT NULL,
	`success_rate` real NOT NULL,
	`error_rate` real NOT NULL,
	`p95_latency_ms` integer NOT NULL,
	`duplicate_writes` integer NOT NULL,
	`trace_ids_json` text NOT NULL,
	`source` text NOT NULL,
	`evaluated_at` text NOT NULL,
	`policy_version` text NOT NULL,
	PRIMARY KEY(`run_id`, `id`),
	UNIQUE(`run_id`, `release_id`, `cohort`, `run_number`)
);
--> statement-breakpoint
CREATE TABLE `demo_action_commands` (
	`run_id` text NOT NULL,
	`command_id` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `command_id`)
);
--> statement-breakpoint
CREATE TABLE `demo_transition_claims` (
	`run_id` text NOT NULL,
	`target_id` text NOT NULL,
	`expected_updated_at` text NOT NULL,
	`command_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `target_id`, `expected_updated_at`)
);
--> statement-breakpoint
CREATE INDEX `demo_dependencies_exposure_idx` ON `demo_connector_dependencies` (`run_id`, `provider`, `connector_family`, `enabled`, `connector_version`);
--> statement-breakpoint
CREATE INDEX `demo_probes_due_idx` ON `demo_evidence_probes` (`run_id`, `status`, `updated_at`);
