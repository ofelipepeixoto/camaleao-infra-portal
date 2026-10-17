import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Subjects originate exclusively from the Sites identity ingress. A personal
// workspace uses that subject as its tenant; clients never supply tenant IDs.
export const memberships = sqliteTable("portal_memberships", {
  subject: text("subject").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
}, (table) => [check("membership_active", sql`${table.active} IN (0, 1)`)]);

export const intakes = sqliteTable("portal_intakes", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  ownerSubject: text("owner_subject").notNull().references(() => memberships.subject),
  intakeJson: text("intake_json").notNull(),
  stage: text("stage").notNull().default("submitted"),
  version: integer("version").notNull().default(0),
  hash: text("hash"),
  publishedVersion: integer("published_version"),
  publishedHash: text("published_hash"),
  operationToken: text("operation_token").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("intakes_tenant").on(table.tenantId, table.updatedAt),
  check("intake_stage", sql`${table.stage} IN ('submitted', 'draft', 'reviewed', 'published')`),
  check("intake_version", sql`${table.version} >= 0`),
]);

export const revisions = sqliteTable("portal_revisions", {
  intakeId: text("intake_id").notNull().references(() => intakes.id),
  version: integer("version").notNull(),
  hash: text("hash").notNull(),
  diagnosticJson: text("diagnostic_json").notNull(),
  source: text("source").notNull(),
  actorSubject: text("actor_subject").notNull().references(() => memberships.subject),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.intakeId, table.version] }),
  check("revision_source", sql`${table.source} IN ('deterministic', 'human_review', 'openai')`),
  check("revision_version", sql`${table.version} > 0`),
]);

export const approvals = sqliteTable("portal_approvals", {
  id: text("id").primaryKey(),
  intakeId: text("intake_id").notNull().references(() => intakes.id),
  version: integer("version").notNull(),
  hash: text("hash").notNull(),
  reviewerSubject: text("reviewer_subject").notNull().references(() => memberships.subject),
  approvedAt: text("approved_at").notNull(),
}, (table) => [uniqueIndex("approval_version").on(table.intakeId, table.version)]);

export const audit = sqliteTable("portal_audit", {
  id: text("id").primaryKey(),
  intakeId: text("intake_id").notNull().references(() => intakes.id),
  actorSubject: text("actor_subject").notNull().references(() => memberships.subject),
  event: text("event").notNull(),
  version: integer("version").notNull(),
  hash: text("hash"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("audit_intake").on(table.intakeId, table.createdAt)]);

// Lifetime caps count unsettled reservations as spent. Unknown provider outcomes
// never expire automatically and cannot be retried against the same base version.
export const aiOperations = sqliteTable("portal_ai_operations", {
  id: text("id").primaryKey(),
  requestHash: text("request_hash").notNull(),
  caseId: text("case_id").notNull().references(() => intakes.id),
  expectedVersion: integer("expected_version").notNull(),
  expectedHash: text("expected_hash").notNull(),
  ownerSubject: text("owner_subject").notNull().references(() => memberships.subject),
  actorSubject: text("actor_subject").notNull().references(() => memberships.subject),
  reservedMicrousd: integer("reserved_microusd").notNull(),
  spentMicrousd: integer("spent_microusd").notNull().default(0),
  status: text("status").notNull(),
  providerResponseId: text("provider_response_id"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [
  uniqueIndex("ai_case_base_version").on(table.caseId, table.expectedVersion),
  check("ai_operation_status", sql`${table.status} IN ('reserved', 'unknown', 'settled', 'attached')`),
  check("ai_reserve_positive", sql`${table.reservedMicrousd} > 0`),
  check("ai_spent_nonnegative", sql`${table.spentMicrousd} >= 0`),
]);
