CREATE TABLE `portal_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`intake_id` text NOT NULL,
	`version` integer NOT NULL,
	`hash` text NOT NULL,
	`reviewer_subject` text NOT NULL,
	`approved_at` text NOT NULL,
	FOREIGN KEY (`intake_id`) REFERENCES `portal_intakes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_subject`) REFERENCES `portal_memberships`(`subject`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approval_version` ON `portal_approvals` (`intake_id`,`version`);--> statement-breakpoint
CREATE TABLE `portal_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`intake_id` text NOT NULL,
	`actor_subject` text NOT NULL,
	`event` text NOT NULL,
	`version` integer NOT NULL,
	`hash` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`intake_id`) REFERENCES `portal_intakes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_subject`) REFERENCES `portal_memberships`(`subject`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_intake` ON `portal_audit` (`intake_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `portal_intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`owner_subject` text NOT NULL,
	`intake_json` text NOT NULL,
	`stage` text DEFAULT 'submitted' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`hash` text,
	`published_version` integer,
	`published_hash` text,
	`operation_token` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_subject`) REFERENCES `portal_memberships`(`subject`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "intake_stage" CHECK("portal_intakes"."stage" IN ('submitted', 'draft', 'reviewed', 'published')),
	CONSTRAINT "intake_version" CHECK("portal_intakes"."version" >= 0)
);
--> statement-breakpoint
CREATE INDEX `intakes_tenant` ON `portal_intakes` (`tenant_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `portal_memberships` (
	`subject` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "membership_active" CHECK("portal_memberships"."active" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `portal_revisions` (
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
	CONSTRAINT "revision_source" CHECK("portal_revisions"."source" IN ('deterministic', 'human_review')),
	CONSTRAINT "revision_version" CHECK("portal_revisions"."version" > 0)
);
