import { DatabaseSync } from 'node:sqlite'
import { openSync, closeSync, chmodSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export class CapacityError extends Error {}
export class Store {
  constructor(file) {
    closeSync(openSync(file,'a',0o600))
    this.db=new DatabaseSync(file)
    const application=this.db.prepare('PRAGMA application_id').get().application_id
    const tables=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    if((application!==0x474b5442 && tables.length) || this.db.prepare('PRAGMA user_version').get().user_version>1) {this.db.close();throw new Error('State belongs to a different adapter version; use a separate state file')}
    chmodSync(file,0o600)
    this.db.exec(`PRAGMA application_id=1196119106; PRAGMA user_version=1; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE IF NOT EXISTS routes(id TEXT PRIMARY KEY,fingerprint TEXT,generation TEXT);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,route TEXT,generation TEXT,payload TEXT,phase TEXT,error TEXT,bytes INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS jobs_phase_route ON jobs(phase,route);
      CREATE TABLE IF NOT EXISTS uploads(job TEXT PRIMARY KEY,id TEXT);
      CREATE TABLE IF NOT EXISTS outgoing(id TEXT PRIMARY KEY,state TEXT,messages TEXT);
      CREATE TABLE IF NOT EXISTS links(route TEXT,generation TEXT,message INTEGER,origin TEXT,PRIMARY KEY(route,generation,message));
      CREATE TABLE IF NOT EXISTS buttons(token TEXT PRIMARY KEY,route TEXT,generation TEXT,decision TEXT,choice TEXT,fingerprint TEXT,message INTEGER,expires INTEGER,used INTEGER);`)
  }
  get offset(){return Number(this.db.prepare("SELECT value FROM meta WHERE key='offset'").get()?.value ?? 0)}
  bind(config) {
    const previous=this.db.prepare("SELECT value FROM meta WHERE key='bot'").get()?.value
    if(previous && previous!==String(config.botId)) throw new Error('State is bound to another bot')
    this.db.prepare("INSERT OR IGNORE INTO meta VALUES('bot',?)").run(String(config.botId))
    const known=this.db.prepare('SELECT * FROM routes').all()
    if(this.db.prepare("SELECT count(*) AS n FROM meta WHERE key LIKE 'generation:%'").get().n+config.routes.filter(route=>!known.some(one=>one.id===route.id&&one.fingerprint===digest(route))).length>2048) throw new CapacityError('Route generation registry full (2048); reconcile and archive explicitly')
    for(const old of known)if(!config.routes.some(route=>route.id===old.id))this.db.prepare('DELETE FROM routes WHERE id=?').run(old.id)
    return config.routes.map(route=>{
      const fingerprint=digest(route),old=known.find(one=>one.id===route.id && one.fingerprint===fingerprint)
      const generation=old?.generation ?? randomUUID()
      this.db.prepare("INSERT OR IGNORE INTO meta VALUES(?,?)").run(`generation:${generation}`,route.id)
      this.db.prepare('INSERT INTO routes VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint,generation=excluded.generation').run(route.id,fingerprint,generation)
      return {...route,generation}
    })
  }
  accept(update,payload,config) {
    const id=String(update.update_id)
    if(!Number.isSafeInteger(update.update_id)||update.update_id<0) throw new Error('Invalid Telegram update')
    if(update.update_id<this.offset)return
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if(payload && !this.job(id)) {
        const pending=this.db.prepare("SELECT route,count(*) AS n FROM jobs WHERE phase IN ('queued','sending') GROUP BY route").all()
        const retained=this.db.prepare('SELECT count(*) AS n,coalesce(sum(bytes),0) AS bytes FROM jobs').get()
        if(pending.reduce((n,row)=>n+row.n,0)>=config.queueTotal || (pending.find(row=>row.route===payload.route)?.n ?? 0)>=config.queuePerChat)throw new CapacityError('Queue full; Telegram acknowledgement is waiting for capacity')
        if(retained.n>=10000||retained.bytes+Buffer.byteLength(JSON.stringify(payload))>128*1024*1024)throw new CapacityError('Request storage full (10000 / 128 MiB); reconcile before archival')
        if(payload.kind==='decision') {
          const result=this.db.prepare('UPDATE buttons SET used=1 WHERE token=? AND used=0').run(payload.token)
          if(result.changes!==1)throw new Error('Button already consumed')
        }
        this.db.prepare("INSERT INTO jobs VALUES(?,?,?,?,'queued',NULL,?)").run(id,payload.route,payload.generation,JSON.stringify(payload),Buffer.byteLength(JSON.stringify(payload)))
      }
      this.db.prepare("INSERT INTO meta VALUES('offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(update.update_id+1))
      this.db.exec('COMMIT')
    } catch(error){this.db.exec('ROLLBACK');throw error}
  }
  job(id){return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(String(id))}
  phase(id,phase,error=null){this.db.prepare('UPDATE jobs SET phase=?,error=? WHERE id=?').run(phase,error,String(id))}
  payload(id,payload){
    const bytes=Buffer.byteLength(JSON.stringify(payload)),old=this.db.prepare('SELECT bytes FROM jobs WHERE id=?').get(String(id))
    if(this.db.prepare('SELECT coalesce(sum(bytes),0) AS n FROM jobs').get().n-(old?.bytes??0)+bytes>128*1024*1024)throw new CapacityError('Request storage full (128 MiB)')
    this.db.prepare('UPDATE jobs SET payload=?,bytes=? WHERE id=?').run(JSON.stringify(payload),bytes,String(id))
  }
  upload(id,payload) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.payload(id,payload)
      for(const file of payload.uploaded)this.db.prepare('INSERT OR REPLACE INTO uploads VALUES(?,?)').run(String(id),file)
      this.db.exec('COMMIT')
    }catch(error){this.db.exec('ROLLBACK');throw error}
  }
  waiting(){return this.db.prepare("SELECT id,route,generation,phase FROM jobs WHERE phase IN ('queued','sending','accepted') ORDER BY rowid").all()}
  output(id){return this.db.prepare('SELECT * FROM outgoing WHERE id=?').get(id)}
  outputState(id,state,messages=[]) {
    if(!this.output(id)&&this.db.prepare('SELECT count(*) AS n FROM outgoing').get().n>=10000)throw new CapacityError('Outgoing registry full (10000)')
    this.db.prepare('INSERT INTO outgoing VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,messages=excluded.messages').run(id,state,JSON.stringify(messages))
  }
  remember(route,message,origin,text){this.db.prepare('INSERT OR IGNORE INTO links VALUES(?,?,?,?)').run(route.id,route.generation,message,JSON.stringify({...origin,text,message:String(message)}))}
  reply(route,message){const row=this.db.prepare('SELECT origin FROM links WHERE route=? AND generation=? AND message=?').get(route.id,route.generation,message);return row&&JSON.parse(row.origin)}
  close(){this.db.close()}
}