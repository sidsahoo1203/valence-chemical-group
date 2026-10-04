import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,primaryKey,check} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{scope:text('scope').notNull(),kind:text('kind').notNull(),id:text('id').notNull(),owner:text('owner').notNull().default(''),data:text('data').notNull(),version:integer('version').notNull().default(1)},t=>[primaryKey({columns:[t.scope,t.kind,t.id]}),index('records_owner').on(t.scope,t.kind,t.owner)]);
export const atomicGuard=sqliteTable('atomic_guard',{ok:integer('ok').notNull()},t=>[check('must_change_one_row',sql`${t.ok} = 1`)]);
export const rateLimits=sqliteTable('rate_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});
