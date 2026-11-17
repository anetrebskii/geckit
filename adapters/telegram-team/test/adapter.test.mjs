import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Adapter } from '../index.mjs'
import { validate } from '../config.mjs'
import { CapacityError } from '../store.mjs'

async function fixture(t,patch={}) {
  const dir=mkdtempSync(join(tmpdir(),'telegram-simple-'))
  const config={version:1,botId:123,tokenFile:join(dir,'token'),stateFile:join(dir,'state.sqlite'),users:[11,22],topic:{chatId:-100,topicId:42,actors:[11,22],approvers:[11]},...patch}
  const calls=[],messages=[],deliveries=new Map(),senders=new Map(),watchers=new Map(),fileSenders=new Map(),files=new Map(),decisions=new Map()
  let adapter,nativeFailure
  const context={id:'channel:telegram-team',config:()=>({}),log:{write(){}},status(){},files:{keep(thread,bytes,name,media){const id=`file:${files.size}`;files.set(id,{thread,bytes,name,media});return id},has(thread,id){return files.get(id)?.thread===thread},hold(){},bind(thread,sender){fileSenders.set(thread,sender);return()=>fileSenders.delete(thread)}},conversations:{
    manager(place){assert.equal(place.shared,true);assert.notEqual(place.owner,true);return `channel:telegram-team:${place.key}`},
    deliver(thread,sender){senders.set(thread,sender);return()=>senders.delete(thread)},watch(thread,listener){watchers.set(thread,listener);return()=>watchers.delete(thread)},ready(){},
    async send(thread,input){calls.push({thread,...input});if(nativeFailure)throw new Error('lost acknowledgement');deliveries.set(input.id,'accepted');return 'session'},delivery:id=>deliveries.get(id),decisions:thread=>decisions.get(thread)??[],
    async decide(thread,id,choice,options){calls.push({decision:true,thread,id,choice,options});return {state:'answered'}},summary:thread=>({state:'idle',thread}),current:()=>true,
  }}
  const telegram={call:async()=>({status:'member'}),username:'ExampleBot',start:async()=>123,send:async(route,output)=>{messages.push({route:{...route},...output});return messages.length},download:async()=>Buffer.from('exact bytes').toString('base64')}
  async function start(){adapter=new Adapter(context,{config,token:'123:fake',telegram,manual:true});await adapter.start();return adapter}
  await start()
  t.after(async()=>{await adapter.stop();rmSync(dir,{recursive:true,force:true})})
  const message=(update,actor=11,text='Task',topic=false)=>({update_id:update,message:{message_id:update+1,date:Date.now()/1000,chat:{id:topic?-100:actor,type:topic?'supergroup':'private'},...(topic?{message_thread_id:42}:{}),from:{id:actor},text}})
  return {get adapter(){return adapter},config,context,telegram,calls,messages,deliveries,senders,watchers,decisions,files,fileSenders,message,start,failNative:()=>{nativeFailure=true},async pump(){await adapter.tick();await adapter.idle()},origin(route,id='1'){return {thread:route.thread,session:'session',workers:[],delivery:`delivery:${id}`,request:{id,bot:123,chatId:route.chatId,topicId:route.topicId,generation:route.generation,actor:route.actors[0],messageId:Number(id)+1}}}}
}

test('two DMs and a topic use distinct shared Manager threads, independent answers and source identities',async t=>{
  const f=await fixture(t)
  f.adapter.receive(f.message(1));f.adapter.receive(f.message(2,22));f.adapter.receive(f.message(3,11,'Team',true));await f.pump()
  assert.equal(new Set(f.calls.map(one=>one.thread)).size,3)
  for(const route of f.adapter.routes){await f.senders.get(route.thread)('Answer',f.origin(route),()=>{})}
  assert.deepEqual(f.messages.map(one=>[one.route.chatId,one.route.topicId]),[[11,0],[22,0],[-100,42]])
  assert.deepEqual(f.calls.map(one=>one.request.actor),[11,22,11])
})
test('unlisted actors, bots, anonymous senders, other topics and non-private DM lookalikes never reach Manager',async t=>{
  const f=await fixture(t)
  const inputs=[f.message(1,33),f.message(2),f.message(3),f.message(4,11,'foreign',true),f.message(5)]
  inputs[1].message.from.is_bot=true;inputs[2].message.sender_chat={id:-100};inputs[3].message.message_thread_id=9;inputs[4].message.chat.type='group'
  for(const update of inputs)f.adapter.receive(update)
  await f.pump();assert.equal(f.calls.length,0);assert.equal(f.adapter.store.offset,6)
})
test('offset and admitted text commit together; duplicate delivery after restart does not repeat a task',async t=>{
  const f=await fixture(t);const update=f.message(1);f.adapter.receive(update)
  assert.equal(f.adapter.store.offset,2);assert.equal(JSON.parse(f.adapter.store.job('1').payload).text,'Task')
  await f.adapter.stop();await f.start();f.adapter.receive(update);await f.pump();await f.pump();assert.equal(f.calls.length,1)
})
test('full queue rolls back offset and resumes once there is capacity',async t=>{
  const f=await fixture(t,{queueTotal:1,queuePerChat:1});f.adapter.receive(f.message(1))
  assert.throws(()=>f.adapter.receive(f.message(2,22)),CapacityError);assert.equal(f.adapter.store.offset,2)
  await f.pump();f.adapter.receive(f.message(2,22));assert.equal(f.adapter.store.offset,3)
})
test('failure saving admission leaves offset and request absent',async t=>{
  const f=await fixture(t);f.adapter.store.db.exec("CREATE TRIGGER fail_job BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT,'disk failure'); END")
  assert.throws(()=>f.adapter.receive(f.message(1)));assert.equal(f.adapter.store.offset,0);assert.equal(f.adapter.store.job('1'),undefined)
})
test('lost native acknowledgement is uncertain and is never sent again after restart',async t=>{
  const f=await fixture(t);f.failNative();f.adapter.receive(f.message(1));await f.pump();assert.equal(f.adapter.store.job('1').phase,'uncertain')
  await f.adapter.stop();await f.start();await f.pump();assert.equal(f.calls.length,1)
})
test('crash after send intent uses native receipt, or remains uncertain without retry',async t=>{
  const f=await fixture(t);f.adapter.receive(f.message(1));const route=f.adapter.routes[0]
  f.adapter.store.phase('1','sending');f.deliveries.set(`${route.thread}:1`,'accepted');await f.pump();assert.equal(f.adapter.store.job('1').phase,'accepted');assert.equal(f.calls.length,0)
  f.adapter.receive(f.message(2,22));f.adapter.store.phase('2','sending');await f.pump();assert.equal(f.adapter.store.job('2').phase,'uncertain');assert.equal(f.calls.length,0)
})
test('outgoing intent prevents blind resend when Telegram acknowledgement is lost',async t=>{
  const f=await fixture(t),route=f.adapter.routes[0],origin=f.origin(route)
  f.telegram.send=async()=>{throw new Error('unknown Telegram outcome')}
  await assert.rejects(f.senders.get(route.thread)('Answer',origin,()=>{}));await f.adapter.stop();await f.start()
  const current=f.adapter.routes[0];assert.equal(current.generation,route.generation)
  let count=0;f.telegram.send=async()=>++count
  await assert.rejects(f.senders.get(current.thread)('Answer',origin,()=>{}));assert.equal(count,0)
})
test('delivered receipt reconciles native replay without a second Telegram message',async t=>{
  const f=await fixture(t),route=f.adapter.routes[0],origin=f.origin(route)
  let before=0;await f.senders.get(route.thread)('Answer',origin,()=>before++);await f.senders.get(route.thread)('Answer',origin,()=>before++)
  assert.equal(f.messages.length,1);assert.equal(before,2)
})
test('old generation replies never enter a changed topic; revoked queued work is cancelled',async t=>{
  const f=await fixture(t),old=f.adapter.routes.find(one=>one.id==='topic'),sender=f.senders.get(old.thread)
  f.adapter.receive(f.message(1,11,'Pending',true));await f.adapter.stop();f.config.topic.topicId=99;await f.start();await f.pump()
  const current=f.adapter.routes.find(one=>one.id==='topic');assert.notEqual(current.generation,old.generation)
  await assert.rejects(sender('Old answer',f.origin(old),()=>{}));assert.equal(f.messages.length,0);assert.equal(f.adapter.store.job('1').phase,'cancelled')
})
test('a foreign reply origin is refused even when it is offered to an active DM sender',async t=>{
  const f=await fixture(t),a=f.adapter.routes[0],b=f.adapter.routes[1]
  await assert.rejects(f.senders.get(a.thread)('Private B',f.origin(b),()=>{}));assert.equal(f.messages.length,0)
})
test('authorization is rechecked immediately after native before-send guard',async t=>{
  const f=await fixture(t),route=f.adapter.routes[0]
  await assert.rejects(f.senders.get(route.thread)('Private',f.origin(route),()=>{f.adapter.stopped=true}));f.adapter.stopped=false;assert.equal(f.messages.length,0)
})
test('reply references cannot cross between DMs',async t=>{
  const f=await fixture(t),a=f.adapter.routes[0],b=f.adapter.routes[1]
  await f.senders.get(a.thread)('A answer',f.origin(a),()=>{})
  const update=f.message(2,22,'Reply');update.message.reply_to_message={message_id:1,from:{id:123}}
  f.adapter.receive(update);await f.pump();assert.equal(f.calls[0].replyTo,undefined)
})
test('active-conversation limit is optional, and queue selection is fair when a slot becomes free',async t=>{
  const f=await fixture(t,{maxActiveConversations:1})
  f.adapter.receive(f.message(1));f.adapter.receive(f.message(2));f.adapter.receive(f.message(3,22));await f.pump();assert.equal(f.calls.length,1)
  f.deliveries.set(f.calls[0].id,'answered');await f.pump();assert.equal(f.calls.length,2);assert.equal(f.calls[1].request.actor,22)
})
test('a slow file in one DM does not block subsequent turns in another DM',async t=>{
  const f=await fixture(t);let release;const slow=new Promise(resolve=>release=resolve)
  f.telegram.download=async()=>{await slow;return Buffer.from('bytes').toString('base64')}
  const a=f.message(1);a.message.document={file_id:'slow',file_size:5};f.adapter.receive(a);f.adapter.receive(f.message(2,22));f.adapter.receive(f.message(3,22))
  await f.adapter.tick();await new Promise(resolve=>setTimeout(resolve,0));await f.adapter.tick();await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(f.calls.filter(one=>one.request?.actor===22).length,2);release();await f.adapter.idle()
})
test('input files retain exact bytes and their scope; outgoing file follows its own DM',async t=>{
  const f=await fixture(t),route=f.adapter.routes[0],update=f.message(1)
  update.message.document={file_id:'doc',file_name:'input.txt',file_size:11};f.adapter.receive(update);await f.pump()
  const file=f.files.get(f.calls[0].attachments[0]);assert.equal(file.bytes.toString(),'exact bytes');assert.equal(file.thread,route.thread)
  const receipt=await f.fileSenders.get(route.thread)(Buffer.from('output bytes'),'out.txt','text/plain','File','document',f.origin(route),async()=>{})
  assert.equal(f.messages[0].route.chatId,11);assert.equal(Buffer.from(f.messages[0].bytes,'base64').toString(),'output bytes');assert.equal(receipt.destination,route.thread)
})
test('decision callbacks bind approver, native decision, message, destination, expiry and one-use token',async t=>{
  const f=await fixture(t),route=f.adapter.routes[0],decision={id:'ask',thread:route.thread,title:'Allow?',choices:[{label:'Allow',value:'once'}]}
  f.decisions.set(route.thread,[decision]);await f.adapter.decisions(route,[decision]);const token=f.messages[0].buttons[0][0].callback_data
  const query=(id,actor=11)=>({update_id:id,callback_query:{data:token,from:{id:actor},message:{message_id:1,chat:{id:11},from:{id:123}}}})
  f.adapter.receive(query(1,22));await f.pump();assert.equal(f.calls.length,0)
  f.adapter.receive(query(2));f.adapter.receive(query(3));await f.pump();assert.equal(f.calls.filter(one=>one.decision).length,1)
})
test('expired or changed questions cannot authorize native work',async t=>{
  const f=await fixture(t),route=f.adapter.routes[0],decision={id:'ask',thread:route.thread,title:'Allow?',choices:[{label:'Allow',value:'once'}]}
  f.decisions.set(route.thread,[decision]);await f.adapter.decisions(route,[decision]);const token=f.messages[0].buttons[0][0].callback_data
  f.adapter.store.db.prepare('UPDATE buttons SET expires=0 WHERE token=?').run(token)
  f.adapter.receive({update_id:1,callback_query:{data:token,from:{id:11},message:{message_id:1,chat:{id:11},from:{id:123}}}});await f.pump();assert.equal(f.calls.length,0)
})
test('global Manager controls and history deletion are not forwarded',async t=>{
  const f=await fixture(t);for(const [i,text] of ['/stop','/resume','/clear'].entries())f.adapter.receive(f.message(i+1,11,text))
  for(let i=0;i<3;i++)await f.pump();assert.equal(f.calls.length,0);assert.equal(f.messages.length,3);assert.ok(f.messages.every(one=>one.text.includes('только владельцу')))
})
test('config rejects zero, unknown limits, missing numeric identities and invalid topic approvers',()=>{
  const config={version:1,botId:123,tokenFile:join(tmpdir(),'token'),stateFile:join(tmpdir(),'state'),users:[11]}
  assert.equal(validate(config).maxActiveConversations,null)
  for(const patch of [{maxActiveConversations:0},{maxActiveConversations:-1},{maxActiveConversations:true},{workerLimit:2},{users:['11']},{topic:{chatId:-1,topicId:42,actors:[11],approvers:[22]}}])assert.throws(()=>validate({...config,...patch}))
})
test('removed group member cannot dispatch queued work or receive its outgoing result',async t=>{
  const f=await fixture(t),route=f.adapter.routes.find(one=>one.id==='topic')
  f.adapter.receive(f.message(1,11,'Pending',true));f.telegram.call=async()=>({status:'left'})
  await f.pump();assert.equal(f.calls.length,0);assert.equal(f.adapter.store.job('1').phase,'cancelled')
  await assert.rejects(f.senders.get(route.thread)('Old answer',f.origin(route),()=>{}));assert.equal(f.messages.length,0)
})
test('a callback that expires while waiting in the queue is not approved',async t=>{
  const f=await fixture(t),route=f.adapter.routes[0],decision={id:'ask',thread:route.thread,title:'Allow?',choices:[{label:'Allow',value:'once'}]}
  f.decisions.set(route.thread,[decision]);await f.adapter.decisions(route,[decision]);const token=f.messages[0].buttons[0][0].callback_data
  f.adapter.receive({update_id:1,callback_query:{data:token,from:{id:11},message:{message_id:1,chat:{id:11},from:{id:123}}}})
  f.adapter.store.db.prepare('UPDATE buttons SET expires=0 WHERE token=?').run(token)
  await f.pump();assert.equal(f.calls.length,0);assert.equal(f.adapter.store.job('1').phase,'cancelled')
})

test('oversized input is rejected explicitly without blocking later valid requests',async t=>{
  const f=await fixture(t)
  f.adapter.receive(f.message(1,11,'😀'.repeat(25001)));f.adapter.receive(f.message(2,22,'Valid'))
  await f.pump();assert.equal(f.calls.length,1);assert.equal(f.calls[0].request.actor,22)
  assert.equal(f.messages[0].text.includes('100000'),true);assert.equal(f.adapter.store.offset,3)
})
test('wrong bot identity fails closed and does not leave a state lock',async t=>{
  const f=await fixture(t);await f.adapter.stop();f.telegram.start=async()=>999
  await assert.rejects(f.start());f.telegram.start=async()=>123;await f.start()
  assert.equal(f.adapter.routes.length,3)
})
test('a duplicate receiver cannot acquire the same state while the original remains operational',async t=>{
  const f=await fixture(t),second=new Adapter(f.context,{config:f.config,token:'123:fake',telegram:f.telegram,manual:true})
  await assert.rejects(second.start());f.adapter.receive(f.message(1));await f.pump();assert.equal(f.calls.length,1)
})

test('removing and re-admitting a person creates a fresh generation, while ordinary restart preserves it',async t=>{
  const f=await fixture(t),old=f.adapter.routes.find(one=>one.id==='dm:11')
  await f.adapter.stop();f.config.users=[22];await f.start();assert.equal(f.adapter.routes.some(one=>one.id==='dm:11'),false)
  await f.adapter.stop();f.config.users=[11,22];await f.start();assert.notEqual(f.adapter.routes.find(one=>one.id==='dm:11').generation,old.generation)
})

test('permanent input failure rejects only that request and unblocks later text',async t=>{
 const f=await fixture(t);let attempts=0
 f.telegram.download=async()=>{attempts++;throw Object.assign(new Error('gone'),{permanent:true})}
 const first=f.message(1);first.message.document={file_id:'gone',file_size:4};f.adapter.receive(first);f.adapter.receive(f.message(2,11,'Later text'))
 await f.pump();await f.pump();await f.pump()
 assert.equal(attempts,1);assert.equal(f.adapter.store.job('1').phase,'completed');assert.equal(f.calls.length,1);assert.equal(f.calls[0].text,'Later text');assert.equal(f.messages.length,1);assert.match(f.messages[0].text,/не передан Manager/)
})
test('transient file retries are bounded and survive restart without dropping later text',async t=>{
 const f=await fixture(t);let attempts=0;f.telegram.download=async()=>{attempts++;throw new Error('temporary')}
 const first=f.message(1);first.message.document={file_id:'temporary',file_size:4};f.adapter.receive(first);f.adapter.receive(f.message(2,11,'After failure'))
 await f.pump();assert.equal(attempts,1);await f.pump();assert.equal(attempts,1)
 await f.adapter.stop();await f.start()
 for(let i=0;i<2;i++){const payload=JSON.parse(f.adapter.store.job('1').payload);payload.fileRetryAt=0;f.adapter.store.payload('1',payload);await f.pump()}
 await f.pump();await f.pump();assert.equal(attempts,3);assert.equal(f.calls[0].text,'After failure');assert.equal(f.messages.length,1)
})
test('a temporary download can recover before its retry budget is exhausted',async t=>{
 const f=await fixture(t);let attempts=0;f.telegram.download=async()=>{if(++attempts===1)throw new Error('temporary');return Buffer.from('ok').toString('base64')}
 const input=f.message(1);input.message.document={file_id:'retry',file_size:2};f.adapter.receive(input);await f.pump()
 const payload=JSON.parse(f.adapter.store.job('1').payload);payload.fileRetryAt=0;f.adapter.store.payload('1',payload);await f.pump()
 assert.equal(attempts,2);assert.equal(f.calls.length,1);assert.equal(f.calls[0].attachments.length,1);assert.equal(f.messages.length,0)
})
test('/pending refreshes expired buttons once, only for an authorized approver',async t=>{
 const f=await fixture(t),route=f.adapter.routes.find(r=>r.id==='topic'),decision={id:'refresh',thread:route.thread,title:'Allow?',choices:[{label:'Allow',value:'once'}]}
 f.decisions.set(route.thread,[decision]);await f.pump();const oldToken=f.messages[0].buttons[0][0].callback_data
 f.adapter.store.db.prepare('UPDATE buttons SET expires=0').run()
 f.adapter.receive(f.message(1,22,'/pending',true));await f.pump();assert.equal(f.messages.filter(m=>m.buttons).length,1)
 f.adapter.receive(f.message(2,11,'/pending',true));await f.pump();assert.equal(f.messages.filter(m=>m.buttons).length,2)
 const fresh=f.messages.at(-1),token=fresh.buttons[0][0].callback_data;assert.notEqual(token,oldToken)
 f.adapter.receive(f.message(3,11,'/pending',true));await f.pump();assert.equal(f.messages.filter(m=>m.buttons).length,2)
 const query=(id,data,message)=>({update_id:id,callback_query:{data,from:{id:11},message:{message_id:message,message_thread_id:42,chat:{id:-100},from:{id:123}}}})
 f.adapter.receive(query(4,oldToken,1));await f.pump();assert.equal(f.calls.length,0)
 f.adapter.receive(query(5,token,3));await f.pump();assert.equal(f.calls.filter(c=>c.decision).length,1)
})
test('/pending does not repeat a question whose outgoing delivery is uncertain',async t=>{
 const f=await fixture(t),route=f.adapter.routes[0],decision={id:'unknown',thread:route.thread,title:'Allow?',choices:[{label:'Allow',value:'once'}]}
 f.decisions.set(route.thread,[decision]);let sends=0;f.telegram.send=async()=>{sends++;throw new Error('unknown send')}
 await assert.rejects(f.adapter.decisions(route,[decision]));f.adapter.store.db.prepare('UPDATE buttons SET expires=0').run()
 f.adapter.receive(f.message(1,11,'/pending'));await f.pump();assert.equal(sends,1)
})
