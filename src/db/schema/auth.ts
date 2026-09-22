import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './app'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}))

// The relation key is `users` (not the grammatically natural `user`) on
// purpose: better-auth's drizzle adapter (better-auth/adapters/drizzle,
// internal-adapter.mjs's findSession/findAccountOwnerByKey/etc.) issues
// its own session->user and account->user joins as `join: { user: true }`
// without ever setting `relation: 'one-to-one'` — its join-key derivation
// for a join it doesn't already know is one-to-one always appends "s" to
// the join name it was given ("user" -> "users"), regardless of this
// project's `usePlural` setting (which is about table/model names, not
// relation keys, and flipping it breaks better-auth's own startup schema
// check against this schema's genuinely singular table names). A relation
// literally named `user` therefore never matches what the adapter looks
// up, and the joined row silently comes back undefined — getSession() (and
// therefore every '/app' page) then treats a perfectly valid session as
// "not logged in". This was never caught before this project had an e2e
// suite driving a real browser through a real login; every unit/
// integration test exercises actions/queries directly, never this
// cookie-session path. Reproduces identically against a real Postgres
// server — it's an adapter/schema-key mismatch, not a driver quirk.
export const sessionRelations = relations(session, ({ one }) => ({
  users: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  users: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))
