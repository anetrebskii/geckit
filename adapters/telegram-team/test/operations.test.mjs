import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reload } from '../reload.mjs'
import { prepareState } from '../prepare-state.mjs'
import { Store } from '../store.mjs'
function configuration(t){const dir=mkdtempSync(join(tmpdir(),'telegram-ops-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'config.json'),config={version:1,botId:123,users:[11],tokenFile:join(dir,'token'),stateFile:join(dir,'state.sqlite')};writeFileSync(file,JSON.stringify(config));return {dir,file,config}}
test('reload waits for off AND released state lock before enabling, then waits for connected',async t=>{
 const {file,dir}=configuration(t);const changes=[];let reads=0,locked=true
 const view=state=>({channels:[{id:'channel:telegram-team',state}]})
 const call=async(method,args)=>{if(method==='channels:configure'){changes.push(args[1].enabled);if(args[1].enabled)assert.equal(locked,false);return view('starting')};reads++;if(changes.length===1){if(reads>=3)locked=false;return view(reads===1?'connected':'off')};return view(reads>=5?'connected':'starting')}
 const result=await reload({cli:join(dir,'cli.js'),data:dir,config:file},{call,wait:async()=>{},locked:()=>locked})
 assert.deepEqual(changes,[false,true]);assert.equal(result.state,'connected');assert.equal(reads,5)
})
test('reload does not retry an ambiguous configuration mutation',async t=>{
 const {file,dir}=configuration(t);let mutations=0
 await assert.rejects(reload({cli:join(dir,'cli.js'),data:dir,config:file},{call:async()=>{mutations++;throw new Error('unknown')}}));assert.equal(mutations,1)
})
test('offline migration preserves offset and refuses pending work, wrong identity or existing destination',t=>{
 const {file,dir,config}=configuration(t),oldConfig=join(dir,'legacy-config.json'),oldState=join(dir,'legacy-state.json')
 writeFileSync(oldConfig,JSON.stringify({bot_id:123,chat_id:-100,topic_id:42,state_file:oldState}));writeFileSync(oldState,JSON.stringify({offset:77,target:{bot_id:123,chat_id:-100,topic_id:42},pending:[{id:1}]}))
 assert.throws(()=>prepareState(file,oldConfig,oldState,true),/pending/)
 writeFileSync(oldState,JSON.stringify({offset:77,target:{bot_id:123,chat_id:-100,topic_id:42},pending:[]}));assert.throws(()=>prepareState(file,oldConfig,oldState,false),/Confirm/)
 writeFileSync(oldConfig,JSON.stringify({bot_id:999,state_file:oldState}));assert.throws(()=>prepareState(file,oldConfig,oldState,true),/identity/)
 writeFileSync(oldConfig,JSON.stringify({bot_id:123,chat_id:-100,topic_id:42,state_file:oldState}));
 writeFileSync(oldState,JSON.stringify({offset:77,target:{bot_id:999,chat_id:-100,topic_id:42},pending:[]}));assert.throws(()=>prepareState(file,oldConfig,oldState,true),/target mismatch/);
 writeFileSync(oldState,JSON.stringify({offset:77,target:{bot_id:123,chat_id:-100,topic_id:42},pending:[],queue:{unresolved:1}}));assert.throws(()=>prepareState(file,oldConfig,oldState,true),/pending/);
 writeFileSync(oldState,JSON.stringify({offset:77,target:{bot_id:123,chat_id:-100,topic_id:42},pending:[]}));assert.equal(prepareState(file,oldConfig,oldState,true),77)
 assert.throws(()=>prepareState(file,oldConfig,oldState,true));const store=new Store(config.stateFile);assert.equal(store.offset,77);assert.equal(store.waiting().length,0);store.close()
})
