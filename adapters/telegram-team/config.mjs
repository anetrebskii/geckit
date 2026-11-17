import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'

const positive = value => Number.isSafeInteger(value) && value > 0
const ids = (value, name) => {
  if (!Array.isArray(value) || value.length > 1000 || !value.every(positive) || new Set(value).size !== value.length) throw new Error(`Invalid ${name}: use unique numeric Telegram IDs`)
  return [...value].sort((a,b)=>a-b)
}
export function validate(input) {
  const keys=['version','botId','tokenFile','stateFile','users','topic','queueTotal','queuePerChat','maxActiveConversations']
  if (!input || input.version !== 1 || Object.keys(input).some(key=>!keys.includes(key)) || !positive(input.botId)) throw new Error('Invalid adapter configuration version or fields')
  for(const key of ['tokenFile','stateFile']) if(typeof input[key]!=='string' || !isAbsolute(input[key])) throw new Error(`${key} must be an absolute private path`)
  const users=ids(input.users ?? [],'users')
  const routes=users.map(actor=>({id:`dm:${actor}`,chatId:actor,topicId:0,actors:[actor],approvers:[actor],title:`Telegram DM ${actor}`}))
  if(input.topic!==undefined && input.topic!==null) {
    const topic=input.topic
    if(Object.keys(topic).some(key=>!['chatId','topicId','actors','approvers'].includes(key)) || !Number.isSafeInteger(topic.chatId) || topic.chatId>=0 || !positive(topic.topicId)) throw new Error('Invalid team topic')
    const actors=ids(topic.actors,'topic actors'),approvers=ids(topic.approvers ?? [],'topic approvers')
    if(!actors.length || approvers.some(id=>!actors.includes(id))) throw new Error('Topic approvers must be admitted topic actors')
    routes.push({id:'topic',chatId:topic.chatId,topicId:topic.topicId,actors,approvers,title:'Telegram team topic'})
  }
  const queueTotal=input.queueTotal ?? 1000,queuePerChat=input.queuePerChat ?? 100
  if(!positive(queueTotal)||queueTotal>10000||!positive(queuePerChat)||queuePerChat>queueTotal) throw new Error('Invalid queue capacity: 1..10000 total; per chat cannot exceed total')
  const limit=input.maxActiveConversations ?? null
  if(limit!==null && (!positive(limit)||limit>1000)) throw new Error('maxActiveConversations must be null or 1..1000; zero is not unlimited')
  return {...input,users,routes,queueTotal,queuePerChat,maxActiveConversations:limit}
}
export function readConfig(file) { return validate(JSON.parse(readFileSync(file,'utf8'))) }
export function readToken(file) {
  const match=readFileSync(file,'utf8').split(/\r?\n/).find(line=>line.startsWith('TELEGRAM_BOT_TOKEN='))
  const token=match?.slice('TELEGRAM_BOT_TOKEN='.length).trim().replace(/^(['"])(.*)\1$/,'$2')
  if(!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Private token file lacks a valid TELEGRAM_BOT_TOKEN')
  return token
}