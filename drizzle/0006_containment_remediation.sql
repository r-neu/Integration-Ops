CREATE TABLE `demo_remediation_tasks` (
	`run_id` text NOT NULL,
	`id` text NOT NULL,
	`incident_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`disposition` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`owner` text NOT NULL,
	`owner_label` text NOT NULL,
	`due_at` text NOT NULL,
	`scope` text NOT NULL,
	`completion_condition` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `id`),
	UNIQUE(`run_id`, `incident_id`, `status`)
);
--> statement-breakpoint
CREATE INDEX `demo_remediation_due_idx` ON `demo_remediation_tasks` (`run_id`, `status`, `due_at`);
