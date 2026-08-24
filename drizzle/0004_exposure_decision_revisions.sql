CREATE TABLE `demo_exposure_revisions` (
	`run_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`dependency_snapshot_version` text NOT NULL,
	`input_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`evaluation_mode` text NOT NULL,
	`result_json` text NOT NULL,
	PRIMARY KEY(`run_id`, `decision_id`)
);
--> statement-breakpoint
CREATE INDEX `demo_revisions_incident_idx` ON `demo_exposure_revisions` (`run_id`,`incident_id`,`created_at`);
