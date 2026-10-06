import { sqliteTable, text, integer, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const feedback=sqliteTable('feedback',{
 id:text('id').primaryKey(),
 rating:integer('rating').notNull(),
 message:text('message').notNull(),
 createdAt:text('created_at').notNull(),
 page:text('page').notNull(),
 ticketId:text('ticket_id').notNull().unique(),
 isTest:integer('is_test').notNull().default(0)
},(table)=>[check('rating_range',sql`${table.rating} between 1 and 5`)]);
