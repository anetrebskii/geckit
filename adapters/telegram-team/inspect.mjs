import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
const args=process.argv.slice(2)
if(args[0]!=='--state'||!args[1]||![2,4].includes(args.length)||args.length===4&&args[2]!=='--discard')throw new Error('Use node inspect.mjs --state <private-state.sqlite> [--discard <update-id>]')
const discard=args[3]
if(discard!==undefined && (!/^\d+$/.test(discard)||existsSync(`${args[1]}.lock`)))throw new Error('Disable this adapter and verify its lock is released before discarding a saved request')
const db=new DatabaseSync(args[1],{readOnly:discard===undefined})
try {
  if(db.prepare('PRAGMA application_id').get().application_id!==0x474b5442)throw new Error('This is not Telegram team adapter state')
  if(discard!==undefined){const result=db.prepare("UPDATE jobs SET phase='discarded',error='Discarded by local owner; native work may continue' WHERE id=? AND phase IN ('queued','sending','uncertain')").run(discard);if(result.changes!==1)throw new Error('No unresolved request with that ID. Accepted work must be inspected in GeckIt.');console.log('Saved handoff discarded. This does not stop or repeat native work.')}
  console.log(JSON.stringify({requests:db.prepare('SELECT id,route,phase,error FROM jobs ORDER BY rowid DESC LIMIT 100').all(),outgoing:db.prepare("SELECT id,state FROM outgoing WHERE state!='delivered' ORDER BY rowid DESC LIMIT 100").all()},null,2))
}finally{db.close()}