import { createHash } from 'node:crypto'

import type { ChatSession, SessionCard } from '../shared/api'
import type { ManagerDecision } from '../shared/manager'
import type { Sessions } from './sessions'

type Pending = ReturnType<Sessions['pendingForManager']>[number]
export type ManagerApproval = Pending & { readonly session: ChatSession['id']; readonly decision: ManagerDecision }

function choices(card: SessionCard): ManagerDecision['choices'] {
  if (card.kind === 'permission') return [{ label: 'No', value: 'no' }, { label: 'Allow this session', value: 'session' }, { label: 'Allow once', value: 'once' }]
  if (card.kind === 'start') return [{ label: 'Keep reading only', value: 'no' }, { label: 'Start', value: 'once' }]
  if (card.kind === 'question') return (card.choices ?? []).map((choice) => ({ label: choice, value: choice }))
  const request = card.elicitation
  if (request === undefined || request.error !== undefined || request.url !== undefined || request.fields.length !== 0) return []
  const encoded = (action: 'accept' | 'decline' | 'cancel', remember = false): string => JSON.stringify({ action, content: action === 'accept' ? {} : null, _meta: null, ...(remember ? { remember: true } : {}) })
  return request.rememberAllowed === true
    ? [{ label: 'Decline', value: encoded('decline') }, { label: 'Allow once', value: encoded('accept') }, { label: 'Allow for this session', value: encoded('accept', true) }]
    : [{ label: 'Cancel', value: encoded('cancel') }, { label: 'Decline', value: encoded('decline') }, { label: 'Accept', value: encoded('accept') }]
}

export function managerApproval(session: ChatSession, pending: Pending, epoch: string): ManagerApproval {
  const identity = createHash('sha256').update(JSON.stringify([epoch, session.id, pending.id, pending.fingerprint])).digest('hex')
  const title = [session.manager === true ? 'Manager approval' : `Approval - ${session.title}`, `Project: ${session.project ?? session.root}`, pending.card.title, pending.card.where, pending.card.detail].filter((line) => line !== undefined && line !== '').join('\n\n')
  const answers = choices(pending.card)
  const supported = title.length <= 24_000 && answers.length > 0 && answers.length <= 40 && answers.every((choice) => choice.label.length <= 64)
  const fallback = session.manager === true ? 'This request needs the native GeckIt UI. Manager cannot continue here. Restart Manager or change its assistant in GeckIt Settings → Manager.' : 'This request needs the native GeckIt UI. Open the worker in GeckIt to review and answer it.'
  return { ...pending, session: session.id, decision: { id: `native:${identity}`, kind: 'native', title: supported ? title : `${title.length > 24_000 ? `Approval - ${session.title}\n\nThe full request is too large to show safely in Telegram.` : title}\n\n${fallback}`, choices: supported ? answers : [] } }
}

export class ManagerDecisionFailure extends Error {
  constructor(readonly reason: 'paused' | 'native' | 'choice' | 'changed') {
    super(reason === 'paused' ? 'Manager is paused. Use /resume before answering this approval.' : reason === 'native' ? 'Answer was not sent. A native safety check blocked it. Check the current approval in GeckIt.' : reason === 'changed' ? 'This request changed. Use /status to see current requests.' : 'Use one of the current request’s choices. Typed forms must be answered in GeckIt.')
  }
}
