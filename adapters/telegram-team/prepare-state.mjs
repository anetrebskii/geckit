import { closeSync, openSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readConfig } from './config.mjs'
import { Store } from './store.mjs'

// This offline operation deliberately refuses to adopt or overwrite existing state.
export function prepareState(configFile, legacyConfigFile, legacyStateFile, stopped) {
  if(stopped!==true)throw new Error('Confirm that the old receiver is stopped and no handoff is unresolved')
  const config=readConfig(configFile),old=JSON.parse(readFileSync(legacyConfigFile,'utf8')),state=JSON.parse(readFileSync(legacyStateFile,'utf8'))
  if(old.bot_id!==config.botId||old.state_file!==legacyStateFile||!Number.isSafeInteger(state.offset)||state.offset<0)throw new Error('Legacy bot identity, state path or offset mismatch')
  if(!state.target||['bot_id','chat_id','topic_id'].some(key=>state.target[key]!==old[key]))throw new Error('Legacy state target mismatch; reconcile its identity before migration')
  if(!Array.isArray(state.pending)||state.pending.length||['queue','requests'].some(key=>state[key]!==undefined&&(!Array.isArray(state[key])||state[key].length)))throw new Error('Reconcile old pending work before migration')
  if(config.topic&&(old.chat_id!==config.topic.chatId||old.topic_id!==config.topic.topicId))throw new Error('Legacy destination differs; reconcile the target change separately')
  if(existsSync(`${config.stateFile}.lock`))throw new Error('New receiver must be stopped')
  closeSync(openSync(config.stateFile,'wx',0o600))
  const store=new Store(config.stateFile)
  try {store.bind(config);if(state.offset>0)store.accept({update_id:state.offset-1},undefined,config);return store.offset} finally {store.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [config,legacyConfig,legacyState,confirmation]=process.argv.slice(2)
  if(process.argv.length!==6||confirmation!=='--old-receiver-stopped')throw new Error('Use prepare-state.mjs <new-config> <old-config> <old-state> --old-receiver-stopped')
  console.log('Preserved next update offset:',prepareState(config,legacyConfig,legacyState,true))
}
