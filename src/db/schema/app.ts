import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const planEnum = pgEnum('plan', ['free', 'pro'])
export const appointmentStatusEnum = pgEnum('appointment_status', [
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
])

export const tenants = pgTable(
  'tenant',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    plan: planEnum('plan').notNull().default('free'),
    minNoticeMinutes: integer('min_notice_minutes').notNull().default(120),
    maxAdvanceDays: integer('max_advance_days').notNull().default(60),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('tenant_slug_key').on(t.slug)],
)

export const services = pgTable(
  'service',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    durationMinutes: integer('duration_minutes').notNull(),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    priceCents: integer('price_cents').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('service_tenant_active_idx').on(t.tenantId, t.isActive)],
)

export const weeklyHours = pgTable(
  'weekly_hours',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
  },
  (t) => [index('weekly_hours_tenant_weekday_idx').on(t.tenantId, t.weekday)],
)

export const availabilityExceptions = pgTable(
  'availability_exception',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    isClosed: boolean('is_closed').notNull().default(true),
    startMinute: integer('start_minute'),
    endMinute: integer('end_minute'),
  },
  (t) => [
    uniqueIndex('availability_exception_tenant_date_key').on(
      t.tenantId,
      t.date,
    ),
  ],
)

export const appointments = pgTable(
  'appointment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    customerName: text('customer_name').notNull(),
    customerEmail: text('customer_email').notNull(),
    customerPhone: text('customer_phone').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    // ends_at + buffer. Written by the application; the overlap constraint ranges over it.
    blockedUntil: timestamp('blocked_until', { withTimezone: true }).notNull(),
    status: appointmentStatusEnum('status').notNull().default('confirmed'),
    serviceName: text('service_name').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    bufferMinutes: integer('buffer_minutes').notNull(),
    priceCents: integer('price_cents').notNull(),
    cancelToken: text('cancel_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('appointment_cancel_token_key').on(t.cancelToken),
    index('appointment_tenant_starts_idx').on(t.tenantId, t.startsAt),
  ],
)
