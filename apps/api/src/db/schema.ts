import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

// ─── Enums ──────────────────────────────────────────────────

export const datasetStatusEnum = pgEnum('dataset_status', [
  'uploading',
  'processing',
  'profiling',
  'ready',
  'error',
  'archived',
]);

export const datasetSourceEnum = pgEnum('dataset_source', [
  'csv',
  'excel',
  'json',
  'parquet',
  'api',
  'database',
]);

export const agentRoleEnum = pgEnum('agent_role', [
  'orchestrator',
  'data',
  'analytics',
  'advisory',
]);

export const messageTypeEnum = pgEnum('message_type', [
  'request',
  'response',
  'error',
  'status',
]);

// ─── Tables ─────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('analyst'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const datasets = pgTable('datasets', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  sourceType: datasetSourceEnum('source_type').notNull(),
  status: datasetStatusEnum('status').notNull().default('uploading'),
  rowCount: integer('row_count'),
  columnCount: integer('column_count'),
  sizeBytes: integer('size_bytes').notNull(),
  storagePath: varchar('storage_path', { length: 1000 }),
  profile: jsonb('profile'),
  createdBy: uuid('created_by')
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  activeDatasetId: uuid('active_dataset_id').references(() => datasets.id),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .references(() => sessions.id)
    .notNull(),
  fromAgent: agentRoleEnum('from_agent').notNull(),
  toAgent: agentRoleEnum('to_agent').notNull(),
  type: messageTypeEnum('type').notNull(),
  payload: jsonb('payload').notNull(),
  confidence: jsonb('confidence'),
  parentMessageId: uuid('parent_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
