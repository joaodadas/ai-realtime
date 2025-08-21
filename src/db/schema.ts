import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    phoneUq: uniqueIndex('contacts_phone_uq').on(t.phone),
    e164Chk: check('contacts_phone_e164_chk', sql`phone ~ '^\\+\\d{10,15}$'`),
  })
);
