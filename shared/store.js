export class Conflict extends Error { constructor(){super('This record changed. Refresh and try again.');this.status=409;} }
export class D1Store {
  constructor(db,scope='production'){this.db=db;this.scope=scope;}
  async get(kind,id){const r=await this.db.prepare('SELECT data,version FROM records WHERE scope=? AND kind=? AND id=?').bind(this.scope,kind,id).first();return r?{...JSON.parse(r.data),_v:r.version}:null;}
  async list(kind,owner){const sql=owner===undefined?'SELECT data,version FROM records WHERE scope=? AND kind=? ORDER BY rowid DESC LIMIT 1000':'SELECT data,version FROM records WHERE scope=? AND kind=? AND owner=? ORDER BY rowid DESC LIMIT 1000';const q=this.db.prepare(sql).bind(...[this.scope,kind,...(owner===undefined?[]:[owner])]);return (await q.all()).results.map(r=>({...JSON.parse(r.data),_v:r.version}));}
  async commit(changes){
    const statements=[];
    for(const {kind,doc,remove=false} of changes){
      const { _v,...data }=doc;
      if(remove)statements.push(this.db.prepare('DELETE FROM records WHERE scope=? AND kind=? AND id=? AND version=?').bind(this.scope,kind,doc.id,_v));
      else if(_v)statements.push(this.db.prepare('UPDATE records SET data=?,owner=?,version=version+1 WHERE scope=? AND kind=? AND id=? AND version=?').bind(JSON.stringify(data),doc.buyer||doc.owner||'',this.scope,kind,doc.id,_v));
      else statements.push(this.db.prepare('INSERT INTO records(scope,kind,id,owner,data,version) VALUES(?,?,?,?,?,1)').bind(this.scope,kind,doc.id,doc.buyer||doc.owner||'',JSON.stringify(data)));
      statements.push(this.db.prepare('INSERT INTO atomic_guard(ok) VALUES(changes())'));
      statements.push(this.db.prepare('DELETE FROM atomic_guard'));
    }
    try {await this.db.batch(statements);} catch(e){if(/UNIQUE|must_change_one_row|CHECK constraint/i.test(e.message))throw new Conflict();throw e;}
  }
  async rate(key,limit,windowSeconds){const now=Math.floor(Date.now()/1000),k=this.scope+':'+key;const row=await this.db.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN ? ELSE expires END RETURNING count').bind(k,now+windowSeconds,now,now,now+windowSeconds).first();if(Math.random()<0.01)await this.db.prepare('DELETE FROM rate_limits WHERE expires<?').bind(now).run();return row.count<=limit;}
}
