import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Manager } from '../src/main/manager'
import { ManagerOperations } from '../src/main/manager-operations'
import { Sessions, memoryNotes } from '../src/main/sessions'
import { ChannelAttachments } from '../src/main/channel-attachments'
import { Channels } from '../src/main/channels/channels'
import { channelManifest } from '../src/main/channels/libraries'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Settings } from '../src/shared/api'
import type { ManagerView } from '../src/shared/manager'
import type { Heard } from '../src/main/sessions/heard'
import type { CoreEvent } from '../src/core/events'
import type { ChannelContext } from '../src/main/channels/channel-api'

const cleanup: (() => Promise<void>)[]=[]
afterEach(async()=>{for(const stop of cleanup.splice(0))await stop()})
async function fixture(manual=true) {
  const directory=await mkdtemp(join(tmpdir(),'telegram-channel-real-')),root=join(directory,'project')
  await mkdir(root)
  const notes=memoryNotes(),heard=new Map<string,(event:Heard)=>void>(),sent:{id:string;text:string}[]=[],outgoing:{chat_id:number;message_thread_id?:number;text?:string}[]=[]
  let settings:Settings={...DEFAULT_SETTINGS,projects:[root],chatProviders:['claude'],chatProvider:'claude',vpnIpCheck:false}
  let view:ManagerView|undefined
  const listeners=new Set<(event:CoreEvent)=>void>()
  const sessions=new Sessions({notes,changed:all=>manager?.observeSessions(all),items:()=>undefined,account:()=>undefined,notify:()=>undefined,
    claude:(options,hear)=>{heard.set(options.id,hear);return {send:text=>{sent.push({id:options.id,text})},answer:()=>undefined,stop:()=>hear({items:[],gone:[],signals:[{kind:'ended',how:'stopped'}]}),end:async()=>undefined}},
    disk:{list:async()=>[],read:async()=>undefined,has:async()=>false},claudeAccount:async()=>({here:true,signedIn:true,plan:'Max'}),claudeModels:async()=>[],claudeProgram:async()=>undefined,usage:async()=>({windows:new Map()}),limit:()=>0})
  const attachments=new ChannelAttachments(directory)
  const manager:Manager=new Manager({directory,sessions,notes,attachments,settings:()=>settings,saveSettings:change=>settings={...settings,...change},threadAllowed:thread=>channels?.allowed(thread)!==false,cli:async()=>''})
  manager.on(value=>{view=value;for(const listener of listeners)listener({name:'manager:view',args:[value]})})
  await manager.configure({enabled:true});view=await manager.view()
  const path=resolve('../adapters/telegram-team'),{entry:_,...info}=await channelManifest(path)
  const {Adapter}=await import(new URL('../../adapters/telegram-team/index.mjs',import.meta.url).href)
  const config={version:1,botId:123,tokenFile:join(directory,'token'),stateFile:join(directory,'state.sqlite'),users:[11,22],topic:{chatId:-100,topicId:42,actors:[11,22],approvers:[11]}}
  const configFile=join(directory,'config.json');await writeFile(configFile,JSON.stringify(config))
  let adapter:InstanceType<typeof Adapter>,context:ChannelContext
  const fetcher=async(url:string|URL,options:{body?:string|FormData;signal?:AbortSignal})=>{
    const method=String(url).split('/').at(-1)
    if(method==='getUpdates')return new Promise<Response>((_resolve,reject)=>{options.signal?.addEventListener('abort',()=>reject(new Error('read stopped')),{once:true})})
    if(method==='getMe')return Response.json({ok:true,result:{id:123,username:'ExampleBot'}})
    if(method==='getChatMember')return Response.json({ok:true,result:{status:'member'}})
    if(method==='getWebhookInfo')return Response.json({ok:true,result:{url:''}})
    if(method==='sendMessage'){outgoing.push(JSON.parse(String(options.body)));return Response.json({ok:true,result:{message_id:outgoing.length}})}
    throw new Error(`Unexpected fake API method ${method}`)
  }
  const channels:Channels=new Channels({directory,attachments,registry:{loaded:[{info,path,module:{create:ctx=>{context=ctx;adapter=new Adapter(ctx,{config,token:'123:fake',fetch:fetcher,manual});return adapter}}}],failures:[]},builtIns:[],
    vault:{available:()=>true,encrypt:text=>Buffer.from(text),decrypt:bytes=>Buffer.from(bytes).toString()},settings:()=>settings,save:change=>settings={...settings,...change},
    sessions,conversations:()=>[],labelConversation:()=>undefined,manager,managerView:()=>view,employees:()=>[],projectName:()=> 'Test',subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},changed:()=>undefined})
  await channels.start();await channels.configure('channel:telegram-team',{enabled:true,config:{configFile:join(directory,'config.json')}})
  cleanup.push(async()=>{await channels.dispose();manager.dispose();sessions.dispose();await rm(directory,{recursive:true,force:true})})
  expect(channels.view().channels.find(one=>one.id==='channel:telegram-team')).toMatchObject({state:'connected'})
  const message=(id:number,actor:number,topic=false)=>({update_id:id,message:{message_id:id+1,date:Date.now()/1000,chat:{id:topic?-100:actor,type:topic?'supergroup':'private'},...(topic?{message_thread_id:42}:{}),from:{id:actor},text:`Task ${id}`}})
  return {directory,configFile,get adapter(){return adapter},get context(){return context},channels,manager,sessions,notes,root,sent,outgoing,message,settings:()=>settings,finish:(id:string,text:string)=>heard.get(id)?.({items:[{kind:'theirs',id:`answer:${id}`,text}],gone:[],signals:[{kind:'ended',how:'done'}]})}
}
it('fake Telegram HTTP -> public Channels API -> real Manager/Sessions/test provider -> correct two DMs and topic',async()=>{
  const f=await fixture()
  f.adapter.receive(f.message(1,11));f.adapter.receive(f.message(2,22));f.adapter.receive(f.message(3,11,true))
  await f.adapter.tick();await f.adapter.idle();await vi.waitFor(()=>expect(f.sent).toHaveLength(3))
  expect(new Set(f.sent.map(one=>one.id)).size).toBe(3)
  for(const [index,one] of f.sent.entries())f.finish(one.id,`Result ${index}`)
  await vi.waitFor(()=>expect(f.outgoing).toHaveLength(3))
  expect(f.outgoing.map(one=>[one.chat_id,one.message_thread_id??0]).sort()).toEqual([[11,0],[22,0],[-100,42]].sort())
  expect((await f.manager.view()).threads?.filter(one=>one.id.startsWith('channel:telegram-team:'))).toHaveLength(3)
})
it('native tools reject another DM worker, personal workers, global settings and global Manager controls',async()=>{
  const f=await fixture(),a=f.adapter.routes[0],b=f.adapter.routes[1]
  const operations=(thread:string)=>new ManagerOperations({sessions:f.sessions,notes:f.notes,settings:f.settings,saveSettings:()=>{throw new Error('Global writes must not occur')},owner:'manager',managed:id=>f.manager.manages(id),managerSession:()=>undefined,managerThread:()=>thread,sharedThread:()=>true,authorized:()=>f.channels.allowed(thread)})
  const own=operations(a.thread),other=operations(b.thread)
  const worker=JSON.parse(await own.run(['sessions','start','--project',f.root,'--text','Work','--goal','Done'],'one')) as {id:string}
  await expect(other.run(['sessions','show','--id',worker.id],'read')).rejects.toThrow('another Manager thread')
  await expect(other.run(['sessions','stop','--id',worker.id],'stop')).rejects.toThrow('another Manager thread')
  await expect(own.run(['settings','edit','--patch','{}'],'settings')).rejects.toThrow('Team topics')
  await expect(own.run(['manager','pause'],'pause')).rejects.toThrow('Team topics')
  await expect(own.run(['sessions','attach','--id',worker.id],'attach')).rejects.toThrow('Team topics')
  const personal=await f.sessions.startManaged({root:f.root,text:'Personal',mode:'auto',provider:'claude'},'manager','personal')
  await expect(own.run(['sessions','stop','--id',personal],'personal-stop')).rejects.toThrow('another Manager thread')
  await expect(own.run(['sessions','stop','--id',worker.id],'own-stop')).resolves.toBeDefined()
})
it('native channel context exposes no global control and revocation removes delivery permission',async()=>{
  const f=await fixture(),thread=f.adapter.routes[0].thread
  expect(f.context.control).toBeUndefined();expect(f.channels.allowed(thread)).toBe(true)
  await f.channels.configure('channel:telegram-team',{enabled:false})
  expect(f.channels.allowed(thread)).toBe(false)
  await expect(f.context.conversations.send(thread,{text:'stale'})).rejects.toThrow()
})
it('owner reload helper stops real polling before native Channels restart and preserves thread generations',async()=>{
  const f=await fixture(false),old=f.adapter.routes.map((route:{thread:string})=>route.thread)
  const {reload}=await import(new URL('../../adapters/telegram-team/reload.mjs',import.meta.url).href)
  const changes:boolean[]=[]
  const result=await reload({cli:join(f.directory,'unused-cli.js'),data:f.directory,config:f.configFile},{call:async(method:string,args:[string,{enabled:boolean;config?:{configFile:string}}])=>{
    if(method==='channels:view')return f.channels.view()
    changes.push(args[1].enabled);return f.channels.configure('channel:telegram-team',args[1])
  }})
  expect(changes).toEqual([false,true]);expect(result.state).toBe('connected')
  expect(f.adapter.routes.map((route:{thread:string})=>route.thread)).toEqual(old)
  expect(f.channels.allowed(f.adapter.routes[0].thread)).toBe(true)
})
