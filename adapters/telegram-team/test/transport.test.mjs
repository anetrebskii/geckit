import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Telegram } from '../telegram.mjs'
const json=value=>new Response(JSON.stringify({ ok:true,result:value }),{ headers:{'content-type':'application/json'} })
test('fake Telegram HTTP API: webhook is checked and never deleted',async()=>{
  const calls=[]
  const api=new Telegram('123:FAKE',async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return json(url.endsWith('getMe')?{id:123}:{url:'https://existing-webhook'})})
  await assert.rejects(api.start(),/webhook/); assert.equal(calls.length,2); assert.ok(calls.every(([url])=>!url.includes('deleteWebhook')))
})
test('fake Telegram HTTP API: correct topic and multipart file; token is absent from failures',async()=>{
  const calls=[]; const api=new Telegram('123:FAKE',async(url,options)=>{calls.push([url,options]);return json({message_id:7})})
  assert.equal(await api.send({chatId:-100,topicId:7},{text:'hello'}),7)
  assert.deepEqual(JSON.parse(calls[0][1].body),{chat_id:-100,message_thread_id:7,text:'hello'})
  await api.send({chatId:11,topicId:0},{bytes:Buffer.from('file').toString('base64'),name:'a.txt',media:'text/plain'})
  assert.equal(calls[1][1].body.get('chat_id'),'11'); assert.equal(calls[1][1].body.get('document').name,'a.txt')
  const failed=new Telegram('123:FAKE',async()=>{throw new Error('https://api.telegram.org/bot123:FAKE/getMe')})
  await assert.rejects(failed.start(),error=>!error.message.includes('FAKE'))
})
test('download rejects traversal, oversized metadata and oversized streamed content',async()=>{
  const bad=new Telegram('123:FAKE',async()=>json({file_path:'../secret'})); await assert.rejects(bad.download({file_id:'x'}),/Invalid/)
  await assert.rejects(bad.download({file_id:'x',file_size:21*1024*1024}),/20 MiB/)
  const api=new Telegram('123:FAKE',async url=>url.includes('/getFile')?json({file_path:'files/a'}):new Response(new Uint8Array(21*1024*1024)))
  await assert.rejects(api.download({file_id:'x'}),/download failed/)
})

test('stopReads aborts long polling but does not abort an in-flight outgoing mutation',async()=>{
 let reading,writing,completeWrite
 const api=new Telegram('123:FAKE',async(url,options)=>{
  if(url.endsWith('/getUpdates')){reading=options.signal;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))}
  writing=options.signal;return new Promise(resolve=>completeWrite=()=>resolve(json({message_id:8})))
 })
 const poll=api.updates(1);const rejected=assert.rejects(poll)
 const send=api.send({chatId:11,topicId:0},{text:'one mutation'})
 api.stopReads();assert.equal(reading.aborted,true);assert.equal(writing.aborted,false);completeWrite();assert.equal(await send,8);await rejected
})
test('read failures distinguish permanent rejection from rate limits and server failures',async()=>{
 for(const [status,permanent] of [[400,true],[404,true],[429,false],[500,false]]){
  const api=new Telegram('123:FAKE',async()=>new Response(JSON.stringify({ok:false}),{status}))
  await assert.rejects(api.download({file_id:'x'}),error=>error.permanent===permanent&&!error.message.includes('FAKE'))
 }
})

test('truncated or empty download is never accepted as a complete attachment',async()=>{
 for(const body of ['short','']){
  const api=new Telegram('123:FAKE',async url=>url.includes('/getFile')?json({file_path:'files/a',file_size:12}):new Response(body))
  await assert.rejects(api.download({file_id:'x',file_size:12}),error=>error.permanent===false&&/incomplete/.test(error.message))
 }
 const header=new Telegram('123:FAKE',async url=>url.includes('/getFile')?json({file_path:'files/a'}):new Response('short',{headers:{'content-length':'12'}}))
 await assert.rejects(header.download({file_id:'x'}),/incomplete/)
 const good=new Telegram('123:FAKE',async url=>url.includes('/getFile')?json({file_path:'files/a',file_size:5}):new Response('exact'))
 assert.equal(Buffer.from(await good.download({file_id:'x',file_size:5}),'base64').toString(),'exact')
})
test('outgoing photo uses sendPhoto and multipart photo field',async()=>{
 let method,form
 const api=new Telegram('123:FAKE',async(url,options)=>{method=url.split('/').at(-1);form=options.body;return json({message_id:9})})
 assert.equal(await api.send({chatId:-100,topicId:42},{bytes:Buffer.from('photo bytes').toString('base64'),name:'check.png',format:'photo',media:'image/png'}),9)
 assert.equal(method,'sendPhoto');assert.ok(form.has('photo'));assert.equal(form.has('document'),false);assert.equal(form.get('message_thread_id'),'42')
})
