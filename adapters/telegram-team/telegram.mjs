export function splitText(text, limit=4000) { const parts=[];let part='';for(const character of text){if(part.length+character.length>limit){parts.push(part);part=''}part+=character};if(part||!parts.length)parts.push(part);return parts }
const MAX = 20 * 1024 * 1024
export class ReadFailure extends Error {
  constructor(message, permanent=false) { super(message); this.permanent=permanent }
}
export class Telegram {
  constructor(token, fetcher = fetch) {
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Invalid bot token')
    this.token = token; this.fetcher = fetcher; this.reads = new AbortController()
  }
  stopReads() { this.reads.abort() }
  readSignal(timeout) { return AbortSignal.any([this.reads.signal, AbortSignal.timeout(timeout)]) }
  async call(method, input = {}) {
    const reading=['getMe','getWebhookInfo','getUpdates','getChatMember','getFile'].includes(method)
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${this.token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: reading ? this.readSignal(40000) : AbortSignal.timeout(40000), redirect: 'error' })
      const result = await response.json()
      if(response.status===409) { const error=new Error('Another Telegram receiver is active; polling is paused');error.code='POLL_CONFLICT';throw error }
      if (!response.ok || !result.ok) {
        if(reading)throw new ReadFailure('Telegram read rejected',response.status>=400&&response.status<500&&![408,429].includes(response.status))
        throw new Error('Telegram rejected operation')
      }
      return result.result
    } catch(error) { if(error.code==='POLL_CONFLICT'||error instanceof ReadFailure) throw error;if(reading)throw new ReadFailure('Telegram read failed');throw new Error(`Telegram ${method} failed; outcome may be unknown`) }
  }
  async start() {
    const bot = await this.call('getMe'); this.username = bot.username
    const webhook = await this.call('getWebhookInfo')
    if (webhook.url) throw new Error('Bot has an active webhook; disable it explicitly before polling')
    return bot.id
  }
  updates(offset) { return this.call('getUpdates', { offset, timeout: 20, limit: 50, allowed_updates: ['message','callback_query'] }) }
  async download(file) {
    if (file.file_size > MAX) throw new ReadFailure('File exceeds 20 MiB',true)
    const info = await this.call('getFile', { file_id: file.file_id })
    if (info.file_size > MAX || typeof info.file_path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(info.file_path) || info.file_path.split('/').includes('..')) throw new ReadFailure('Invalid Telegram file',true)
    try {
      const response = await this.fetcher(`https://api.telegram.org/file/bot${this.token}/${info.file_path}`, { redirect: 'error', signal: this.readSignal(30000) })
      if(!response.ok)throw new ReadFailure('Telegram file unavailable',response.status>=400&&response.status<500&&![408,429].includes(response.status))
      if(Number(response.headers.get('content-length'))>MAX)throw new ReadFailure('Telegram file too large',true)
      const chunks = []; let size = 0
      for await (const chunk of response.body) { size += chunk.length; if (size > MAX) { await response.body.cancel().catch(() => {}); throw new ReadFailure('Telegram file download failed: too large',true) }; chunks.push(chunk) }
      const declared=[file.file_size,info.file_size,response.headers.has('content-length')?Number(response.headers.get('content-length')):undefined].filter(value=>value!==undefined)
      if(size===0||declared.some(value=>!Number.isSafeInteger(value)||value<1||value!==size))throw new ReadFailure('Telegram file download failed: incomplete content')
      return Buffer.concat(chunks).toString('base64')
    } catch(error) { if(error instanceof ReadFailure)throw error;throw new ReadFailure('Telegram file download failed') }
  }
  async send(route, output) {
    const destination = { chat_id: route.chatId, ...(route.topicId ? { message_thread_id: route.topicId } : {}) }
    if (!output.bytes) {
      if ((output.text ?? '').length > 4096) throw new Error('Text exceeds one Telegram message; delivery requires inspection')
      return (await this.call('sendMessage', { ...destination, text: output.text, ...(output.replyMessage?{reply_parameters:{message_id:output.replyMessage,allow_sending_without_reply:false}}:{}), ...(output.buttons ? {reply_markup:{inline_keyboard:output.buttons}} : {}) })).message_id
    }
    const form = new FormData()
    if(output.replyMessage) form.set('reply_parameters',JSON.stringify({message_id:output.replyMessage,allow_sending_without_reply:false}))
    for (const [key, value] of Object.entries(destination)) form.set(key, String(value))
    const format=output.format==='photo'?'photo':'document'
    form.set(format, new Blob([Buffer.from(output.bytes, 'base64')], { type: output.media ?? 'application/octet-stream' }), output.name ?? 'file')
    if (output.text) form.set('caption', splitText(output.text,1000)[0])
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${this.token}/${format==='photo'?'sendPhoto':'sendDocument'}`, { method: 'POST', body: form, signal: AbortSignal.timeout(40000), redirect: 'error' })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error('Rejected')
      return result.result.message_id
    } catch { throw new Error('Telegram file send failed; outcome unknown') }
  }
}
