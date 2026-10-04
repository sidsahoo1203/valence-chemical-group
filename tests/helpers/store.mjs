import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export class TestD1 {
 constructor(){this.sql=new DatabaseSync(':memory:');this.sql.exec(readFileSync(new URL('../../drizzle/0000_colossal_miracleman.sql',import.meta.url),'utf8'));}
 prepare(sql){const db=this.sql;return {bind(...args){return {first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args),_sql:sql,_args:args};},_sql:sql,_args:[]};}
 async batch(statements){this.sql.exec('BEGIN');try{const result=statements.map(s=>this.sql.prepare(s._sql).run(...s._args));this.sql.exec('COMMIT');return result;}catch(e){this.sql.exec('ROLLBACK');throw e;}}
}
