import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { readConfig } from './config.mjs'

const execute = promisify(execFile)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
export async function reload({cli, data, config}, dependencies={}) {
  if (![cli,data,config].every(value=>typeof value==='string'&&isAbsolute(value))) throw new Error('Use absolute --cli, --data and --config paths')
  const settings=readConfig(config)
  const call=dependencies.call ?? (async(method,args)=>{
    const {stdout}=await execute(process.execPath,[cli,'service','call',method,JSON.stringify(args)],{env:{...process.env,GECKIT_DATA:data},timeout:30000,maxBuffer:1024*1024})
    return JSON.parse(stdout)
  })
  const sleep=dependencies.wait ?? wait,locked=dependencies.locked ?? (()=>existsSync(`${settings.stateFile}.lock`))
  const deadline=Date.now()+90000
  const channel=view=>view.channels.find(one=>one.id==='channel:telegram-team')
  const until=async predicate=>{
    for (;;) {
      const current=channel(await call('channels:view',[]))
      if(!current)throw new Error('Install the Telegram team library before reloading it')
      if(predicate(current))return current
      if(Date.now()>deadline)throw new Error('Adapter reload did not finish; inspect channel state before trying again')
      await sleep(200)
    }
  }
  await call('channels:configure',['channel:telegram-team',{enabled:false}])
  await until(current=>current.state==='off'&&!locked())
  await call('channels:configure',['channel:telegram-team',{enabled:true,config:{configFile:config}}])
  return until(current=>{
    if(current.state==='failed'||current.state==='setup')throw new Error('Adapter did not connect; inspect private configuration and channel status')
    return current.state==='connected'
  })
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),values={}
  if(args.length!==6)throw new Error('Use --cli <cli.js> --data <service-data> --config <private-config.json>')
  for(let i=0;i<args.length;i+=2){const key=args[i].slice(2);if(!['cli','data','config'].includes(key)||values[key])throw new Error('Invalid reload arguments');values[key]=args[i+1]}
  try { await reload(values); console.log('Telegram team adapter connected. Existing work was not replayed.') }
  catch { console.error('Reload failed. Inspect Channels and private adapter configuration before retrying; no mutation was automatically repeated.');process.exitCode=1 }
}
