CREATE TABLE `portal_ai_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`case_id` text NOT NULL,
	`expected_version` integer NOT NULL,
	`expected_hash` text NOT NULL,
	`owner_subject` text NOT NULL,
	`actor_subject` text NOT NULL,
	`reserved_microusd` integer NOT NULL,
	`spent_microusd` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`provider_response_id` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`case_id`) REFERENCES `portal_intakes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_subject`) REFERENCES `portal_memberships`(`subject`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_subject`) REFERENCES `portal_memberships`(`subject`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ai_operation_status" CHECK("portal_ai_operations"."status" IN ('reserved', 'unknown', 'settled', 'attached')),
	CONSTRAINT "ai_reserve_positive" CHECK("portal_ai_operations"."reserved_microusd" > 0),
	CONSTRAINT "ai_spent_nonnegative" CHECK("portal_ai_operations"."spent_microusd" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_case_base_version` ON `portal_ai_operations` (`case_id`,`expected_version`);--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_portal_revisions` (
	`intake_id` text NOT NULL,
	`version` integer NOT NULL,
	`hash` text NOT NULL,
	`diagnostic_json` text NOT NULL,
	`source` text NOT NULL,
	`actor_subject` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`intake_id`, `version`),
	FOREIGN KEY (`intake_id`) REFERENCES `portal_intakes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_subject`) REFERENCES `portal_memberships`(`subject`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "revision_source" CHECK("__new_portal_revisions"."source" IN ('deterministic', 'human_review', 'openai')),
	CONSTRAINT "revision_version" CHECK("__new_portal_revisions"."version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_portal_revisions`("intake_id", "version", "hash", "diagnostic_json", "source", "actor_subject", "created_at") SELECT "intake_id", "version", "hash", "diagnostic_json", "source", "actor_subject", "created_at" FROM `portal_revisions`;--> statement-breakpoint
DROP TABLE `portal_revisions`;--> statement-breakpoint
ALTER TABLE `__new_portal_revisions` RENAME TO `portal_revisions`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;