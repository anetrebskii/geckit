import { mkdirSync, openSync, closeSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { readConfig, readToken, validate } from './config.mjs'
import { Store, digest, CapacityError } from './store.mjs'
import { Telegram, splitText } from './telegram.mjs'

const MAX_FILE=20*1024*1024
export class Adapter {
  constructor(context,options={}) {this.context=context;this.options=options;this.routes=[];this.cleanups=[];this.locks=[];this.stopped=true;this.busy=false;this.loops=[];this.outputBusy=new Set();this.inflight=new Set();this.running=new Map()}
  active(route,actor){return !this.stopped && this.routes.includes(route) && (actor===undefined || route.actors.includes(actor))}
  saveError(error){this.problem=error instanceof CapacityError?error.message:'A saved operation needs inspection; it was not repeated.';this.context.log.write('warn','telegram-team.operation.failed',{type:error.constructor.name});this.context.status('failed',this.problem)}
  lock(file) {const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,String(process.pid))}finally{closeSync(fd)};this.locks.push(file)}
  async start() {
    try {
      this.config=this.options.config?validate(this.options.config):readConfig(this.context.config().configFile)
      this.token=this.options.token ?? readToken(this.config.tokenFile)
      mkdirSync(dirname(this.config.stateFile),{recursive:true,mode:0o700})
      this.lock(`${this.config.stateFile}.lock`)
      this.lock(join(tmpdir(),`geckit-telegram-team-${digest(this.token)}.lock`))
      this.store=new Store(this.config.stateFile)
      this.telegram=this.options.telegram ?? new Telegram(this.token,this.options.fetch)
      const bot=await this.telegram.start()
      if(bot!==this.config.botId)throw new Error('Telegram bot ID differs from the configuration')
      if(!this.context.conversations.deliver || !this.context.conversations.decide || !this.context.conversations.delivery)throw new Error('This GeckIt lacks the required channel API version 2 methods')
      this.routes=this.store.bind(this.config)
      this.stopped=false
      for(const route of this.routes) {
        route.thread=this.context.conversations.manager({key:`${route.id}:${route.generation}`,title:route.title,shared:true,labels:{telegramChat:String(route.chatId),telegramTopic:String(route.topicId)}})
        if(!route.thread)throw new Error('Enable Manager in GeckIt before starting the adapter')
        this.cleanups.push(this.context.conversations.deliver(route.thread,(text,origin,before)=>this.sendOutput(route,text,origin,before)))
        this.cleanups.push(this.context.conversations.watch(route.thread,event=>{
          if(event.kind==='decisions')this.track(this.decisions(route,event.decisions)).catch(error=>this.saveError(error))
        }))
        if(this.context.files)this.cleanups.push(this.context.files.bind(route.thread,async(bytes,name,media,caption,as,origin,before)=>{
          if(!['document','photo'].includes(as))throw new Error('Unsupported file format')
          if(bytes.length>(as==='photo'?10*1024*1024:MAX_FILE))throw new CapacityError('File exceeds channel size limit')
          const message=await this.sendOutput(route,caption,origin,before,{bytes:bytes.toString('base64'),name,media,format:as})
          return {channel:this.context.id,destination:route.thread,messageId:String(message),fileId:origin.delivery ?? digest([name,bytes.toString('base64')])}
        },20))
        this.context.conversations.ready?.(route.thread)
      }
      this.holdFiles()
      this.context.status('connected','Team topic and personal conversations are ready')
      if(!this.options.manual) {
        this.loops=[this.loop(async()=>{await this.tick();await this.delay(500)}),this.loop(async()=>{await this.poll();if(this.paused)await this.delay(1000)})]
      }
    }catch(error){await this.stop();throw new Error(error instanceof CapacityError?error.message:'Telegram team adapter could not start. Check private configuration, bot identity, locks and Manager availability.')}
  }
  track(promise){this.inflight.add(promise);promise.then(()=>this.inflight.delete(promise),()=>this.inflight.delete(promise));return promise}
  async idle(){await Promise.allSettled([...this.running.values()])}
  delay(ms){return new Promise(resolve=>{const timer=setTimeout(()=>{this.delays.delete(timer);resolve()},ms);this.delays??=new Map();this.delays.set(timer,resolve)})}
  async loop(action){while(!this.stopped){try{await action()}catch(error){if(this.stopped)return;this.saveError(error);if(error.code==='POLL_CONFLICT')this.paused=true;await this.delay(1500)}}}
  async poll(){if(this.stopped||this.paused)return;const updates=await this.telegram.updates(this.store.offset);if(this.stopped)return;for(const update of updates)this.receive(update)}
  receive(update) {
    if(this.stopped)throw new Error('Adapter stopped')
    let payload
    const query=update.callback_query,message=update.message
    if(query) {
      const button=typeof query.data==='string'?this.store.db.prepare('SELECT * FROM buttons WHERE token=? AND used=0').get(query.data):undefined
      const route=button&&this.routes.find(one=>one.id===button.route&&one.generation===button.generation)
      if(route && !query.from?.is_bot && route.approvers.includes(query.from?.id) && query.message?.from?.id===this.config.botId && query.message?.chat?.id===route.chatId && (query.message.message_thread_id??0)===route.topicId && query.message.message_id===button.message && button.expires>Date.now())
        payload={route:route.id,generation:route.generation,kind:'decision',actor:query.from.id,token:query.data,decision:button.decision,choice:button.choice,fingerprint:button.fingerprint}
    } else if(message && !message.from?.is_bot && !message.sender_chat && Number.isSafeInteger(message.from?.id) && Number.isSafeInteger(message.message_id) && message.message_id>0) {
      const route=this.routes.find(one=>one.chatId===message.chat?.id && one.topicId===(message.message_thread_id??0) && one.actors.includes(message.from.id) && (one.chatId>0 ? message.chat.type==='private'&&message.chat.id===message.from.id : message.chat.type==='supergroup'))
      if(route && Number.isFinite(message.date) && Math.abs(Date.now()/1000-message.date)<600) {
        const text=String(message.text ?? message.caption ?? '')
        const addressed=/^\/[A-Za-z]+@([A-Za-z0-9_]+)/.exec(text)
        if(!addressed || addressed[1].toLowerCase()===this.telegram.username?.toLowerCase()) {
          const files=message.document?[message.document]:message.photo?.length?[message.photo.at(-1)]:[]
          if(text.length||files.length) {
            if(Buffer.byteLength(text)>100000||files.some(file=>file.file_size>MAX_FILE)){
              payload={route:route.id,generation:route.generation,actor:message.from.id,message:message.message_id,kind:'rejected',text:'Сообщение не принято: максимум 100000 байт текста и 20 МиБ на файл. Сократите запрос или файл и отправьте заново.',files:[]}
              this.store.accept(update,payload,this.config);return
            }
            const reply=message.reply_to_message?.from?.id===this.config.botId?this.store.reply(route,message.reply_to_message.message_id):undefined
            payload={route:route.id,generation:route.generation,actor:message.from.id,message:message.message_id,text:text.replace(/^(\/[A-Za-z]+)@[A-Za-z0-9_]+/,'$1'),files,reply}
          }
        }
      }
    }
    this.store.accept(update,payload,this.config)
  }
  async member(route,actor) {
    if(route.chatId>0)return route.chatId===actor
    const member=await this.telegram.call('getChatMember',{chat_id:route.chatId,user_id:actor})
    return ['member','administrator','creator'].includes(member.status)||member.status==='restricted'&&member.is_member===true
  }
  holdFiles(){if(this.context.files){const ids=this.store.db.prepare('SELECT id FROM uploads').all().map(row=>row.id);this.context.files.hold([...new Set(ids)])}}
  async tick() {
    if(this.stopped||this.busy)return
    this.busy=true
    try {
      const rows=this.store.waiting(),active=new Set(this.running.keys())
      for(const row of rows) {
        const route=this.routes.find(one=>one.id===row.route&&one.generation===row.generation)
        if(!route){this.store.phase(row.id,'cancelled','Previous connection generation');continue}
        const nativeId=`${route.thread}:${row.id}`
        if(row.phase==='sending' && !this.running.has(route.id)) {
          this.store.phase(row.id,this.context.conversations.delivery(nativeId)?'accepted':'uncertain','Inspect previous handoff; no blind retry')
          continue
        }
        if(row.phase==='accepted') {
          const state=this.context.conversations.delivery(nativeId)
          if(state==='answered'||state===undefined&&!this.context.conversations.pending?.(route.thread)?.includes(nativeId))this.store.phase(row.id,'completed')
          else active.add(route.id)
        }
      }
      // One waiting request per route per pass: a flooded topic cannot take all slots.
      const candidates=new Map()
      for(const row of rows)if(row.phase==='queued'&&!candidates.has(row.route))candidates.set(row.route,row)
      const ordered=[...candidates.values()],last=ordered.findIndex(row=>row.route===this.lastRoute)
      const fair=last<0?ordered:[...ordered.slice(last+1),...ordered.slice(0,last+1)]
      for(const row of fair) {
        const route=this.routes.find(one=>one.id===row.route&&one.generation===row.generation)
        if(!route || this.running.has(route.id) || this.running.size>=8)continue
        const payload=JSON.parse(this.store.job(row.id).payload),control=['decision','rejected'].includes(payload.kind)||/^\/(status|pending|help|start|stop|resume|clear)(?:\s|$)/.test(payload.text??'')
        if((payload.fileRetryAt??0)>Date.now())continue
        if(!control&&this.config.maxActiveConversations!==null&&!active.has(route.id)&&active.size>=this.config.maxActiveConversations)continue
        active.add(route.id);this.lastRoute=route.id
        const promise=this.handoff(row,route).catch(error=>{if(!this.stopped)this.saveError(error)}).finally(()=>this.running.delete(route.id))
        this.running.set(route.id,promise)
      }
      for(const route of this.routes)await this.decisions(route,this.context.conversations.decisions?.(route.thread)??[])
    }finally{this.busy=false}
  }
  async handoff(row,route) {
    const data=JSON.parse(this.store.job(row.id).payload)
    if(!this.active(route,data.actor)||!await this.member(route,data.actor)){this.store.phase(row.id,'cancelled');return}
    if(data.kind==='rejected'){await this.sendNotice(route,`rejected:${row.id}`,data.text);this.store.phase(row.id,'completed');return}
    if(data.kind==='decision') {
      const current=this.context.conversations.decisions?.(route.thread)?.find(one=>one.id===data.decision)
      if(!route.approvers.includes(data.actor)||!current||digest(current)!==data.fingerprint||this.store.db.prepare('SELECT expires FROM buttons WHERE token=?').get(data.token)?.expires<=Date.now()){this.store.phase(row.id,'cancelled','Decision changed');return}
      this.store.phase(row.id,'sending')
      try{await this.context.conversations.decide(route.thread,data.decision,data.choice,{by:{id:String(data.actor)},authorized:()=>this.active(route,data.actor)&&route.approvers.includes(data.actor)});this.store.phase(row.id,'completed')}
      catch(error){this.store.phase(row.id,'uncertain','Decision acknowledgement missing');throw error}
      return
    }
    const command=data.text.split(/\s/,1)[0]
    if(command==='/pending') {
      if(route.approvers.includes(data.actor))await this.decisions(route,this.context.conversations.decisions?.(route.thread)??[],row.id)
      else await this.sendNotice(route,`notice:${row.id}`,'Обновлять карточки подтверждения может только уполномоченный участник.')
      this.store.phase(row.id,'completed');return
    }
    if(['/status','/help','/start','/stop','/resume','/clear'].includes(command)) {
      const summary=this.context.conversations.summary?.(route.thread)
      const status=command==='/status'?`Эта беседа: ${{idle:'готова',working:'работает',asks:'ждёт решения',failed:'ошибка'}[summary?.state]??'статус недоступен'}. Задач: ${summary?.workers??0}. Неопределённых ответов: ${summary?.uncertain??0}.` : command==='/help'||command==='/start'?'Напишите задачу обычным текстом. Эта беседа отделена от других личек и общей темы. /status — состояние этой беседы. /pending — обновить просроченные карточки подтверждения. Общая остановка Manager и удаление истории доступны владельцу в GeckIt.':'Общая остановка Manager и удаление истории доступны только владельцу в GeckIt.'
      await this.sendNotice(route,`notice:${row.id}`,status)
      this.store.phase(row.id,'completed');return
    }
    if(data.uploaded===undefined) {
      data.uploaded=[]
      for(const file of data.files) {
        if(!this.context.files)throw new Error('GeckIt file capability unavailable')
        const kept=this.store.db.prepare('SELECT count(*) AS n FROM uploads').get().n
        if(kept>=256)throw new CapacityError('Retained input file registry full (256); reconcile and archive explicitly')
        let bytes
        try { bytes=Buffer.from(await this.telegram.download(file),'base64') }
        catch(error) {
          if(this.stopped)throw error
          data.fileAttempts=(data.fileAttempts??0)+1
          if(error.permanent||data.fileAttempts>=3) {
            data.kind='rejected';data.text='Вложение не удалось получить. Этот запрос не передан Manager. Проверьте размер и доступность файла и отправьте его заново.';data.files=[];data.uploaded=[];delete data.fileRetryAt
          } else { data.fileRetryAt=Date.now()+1000*2**(data.fileAttempts-1);delete data.uploaded }
          this.store.payload(row.id,data)
          return
        }
        if(!this.active(route,data.actor))throw new Error('Connection stopped')
        data.uploaded.push(this.context.files.keep(route.thread,bytes,file.file_name??'attachment',file.mime_type??'application/octet-stream'))
        this.store.upload(row.id,data);this.holdFiles()
      }
      this.store.payload(row.id,data)
    }
    if(data.uploaded.some(id=>!this.context.files?.has(route.thread,id))){data.kind='rejected';data.text='Сохранённое вложение недоступно. Запрос не передан Manager. Отправьте файл заново.';this.store.payload(row.id,data);return}
    const request={id:row.id,bot:this.config.botId,chatId:route.chatId,topicId:route.topicId,generation:route.generation,actor:data.actor,messageId:data.message}
    if((this.context.conversations.pending?.(route.thread)?.length??0)>=100)throw new CapacityError('Native conversation queue full (100); saved ingress is waiting')
    if(!this.active(route,data.actor)||!await this.member(route,data.actor)){this.store.phase(row.id,'cancelled');return}
    this.store.phase(row.id,'sending')
    try {
      await this.context.conversations.send(route.thread,{id:`${route.thread}:${row.id}`,text:data.text||'Please inspect the attached file.',from:String(data.actor),request,attachments:data.uploaded,authorized:()=>this.active(route,data.actor),...(data.reply&&data.reply.thread===route.thread&&this.context.conversations.current?.(data.reply)!==false?{replyTo:data.reply}:{})})
      this.store.phase(row.id,'accepted')
    }catch(error){this.store.phase(row.id,this.context.conversations.delivery(`${route.thread}:${row.id}`)?'accepted':'uncertain','Inspect handoff outcome; nothing was resent');throw error}
  }
  async sendNotice(route,id,text,buttons) {
    if(this.store.output(id))return
    this.store.outputState(id,'sending')
    try{if(!this.active(route))throw new Error('Stopped');const message=await this.telegram.send(route,{text,buttons});this.store.outputState(id,'delivered',[message]);return message}
    catch(error){this.store.outputState(id,'uncertain');throw error}
  }
  async decisions(route,decisions,refresh) {
    if(!this.active(route))return
    for(const decision of decisions) {
      if(decision.thread!==route.thread||!route.approvers.length)continue
      const fingerprint=digest(decision),base=`decision:${route.generation}:${fingerprint}`
      const latest=this.store.db.prepare('SELECT state FROM outgoing WHERE id=? OR id LIKE ? ORDER BY rowid DESC LIMIT 1').get(base,`${base}:refresh:%`)
      let id=base
      if(latest) {
        if(!refresh||latest.state!=='delivered')continue
        const valid=this.store.db.prepare('SELECT 1 FROM buttons WHERE route=? AND generation=? AND fingerprint=? AND expires>? LIMIT 1').get(route.id,route.generation,fingerprint,Date.now())
        if(valid)continue
        id=`${base}:refresh:${refresh}`
        if(this.store.output(id))continue
      }
      const n=this.store.db.prepare('SELECT count(*) AS n FROM buttons').get().n
      if(n+decision.choices.length>10000)throw new CapacityError('Button registry full (10000)')
      const buttons=decision.choices.map(choice=>{
        const token=randomBytes(24).toString('base64url')
        this.store.db.prepare('INSERT INTO buttons VALUES(?,?,?,?,?,?,NULL,?,0)').run(token,route.id,route.generation,decision.id,choice.value,fingerprint,Date.now()+600000)
        return [{text:choice.label.slice(0,60),callback_data:token}]
      })
      const message=await this.sendNotice(route,id,splitText(decision.title)[0],buttons)
      if(message)for(const button of buttons)this.store.db.prepare('UPDATE buttons SET message=? WHERE token=?').run(message,button[0].callback_data)
    }
  }
  sendOutput(...args){return this.track(this.output(...args))}
  async output(route,text,origin,before,file) {
    const source=origin.request
    const authorized=()=>this.active(route)&&origin.thread===route.thread&&(!source || source.bot===this.config.botId&&source.chatId===route.chatId&&source.topicId===route.topicId&&source.generation===route.generation&&route.actors.includes(source.actor))
    if(!authorized() || source&&!await this.member(route,source.actor))throw new Error('Output belongs to a revoked or foreign conversation')
    const id=`answer:${route.generation}:${origin.delivery??digest([text,origin,file])}`
    if(this.outputBusy.has(id))throw new Error('Output already claimed')
    const known=this.store.output(id)
    if(known?.state==='delivered'){await before?.();return JSON.parse(known.messages).at(-1)}
    if(known)throw new Error('Previous outgoing result is uncertain; no retry')
    const caption=splitText(text,1000)[0]
    const parts=file?[{...file,text:caption},...(text.length>caption.length?splitText(text.slice(caption.length)).map(text=>({text})):[])]:splitText(text).map(text=>({text}))
    if(this.store.db.prepare('SELECT count(*) AS n FROM links').get().n+parts.length>10000)throw new CapacityError('Reply registry full (10000)')
    this.outputBusy.add(id)
    this.store.outputState(id,'sending')
    const messages=[]
    try {
      await before?.()
      for(const part of parts) {
        if(!authorized() || source&&!await this.member(route,source.actor))throw new Error('Route revoked')
        const message=await this.telegram.send(route,{...part,...(source?{replyMessage:source.messageId}:{})})
        messages.push(message);this.store.remember(route,message,origin,part.text)
      }
      this.store.outputState(id,'delivered',messages)
      return messages.at(-1)
    }catch(error){this.store.outputState(id,'uncertain',messages);throw error}
    finally{this.outputBusy.delete(id)}
  }
  async stop() {
    this.stopped=true
    this.telegram?.stopReads?.()
    for(const cleanup of this.cleanups.splice(0)){try{cleanup()}catch{/* Already removed by the host. */}}
    for(const [timer,resolve] of this.delays??[]){clearTimeout(timer);resolve()};this.delays?.clear()
    await Promise.allSettled(this.loops)
    await this.idle()
    await Promise.allSettled([...this.inflight])
    try { this.context.files?.hold([]) } catch { /* The host invalidates the context before stop. */ }
    this.store?.close();this.store=undefined
    for(const file of this.locks.splice(0))unlinkSync(file)
  }
}
export function create(context,options){return new Adapter(context,options)}