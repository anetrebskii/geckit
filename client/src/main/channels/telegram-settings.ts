import type { ChannelScreen, ChannelScreenAction, ChannelScreenRequest } from '../../shared/channel-ui'
import type { ChannelSettingsContext, Json } from './channel-api'
import type { TelegramAction, TelegramView } from '../../shared/telegram'

const object = (value: Json | undefined): { readonly [key: string]: Json } => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as { readonly [key: string]: Json } : {}
const text = (value: Json | undefined): string => typeof value === 'string' ? value : ''
const action = (label: string, value: string, primary = false): ChannelScreenAction => ({ label, action: value, primary })

const states: { readonly [State in TelegramView['state']]: string } = {
  disconnected: 'Not connected', pairing: 'Waiting for you in Telegram', confirming: 'Confirm your Telegram account', connected: 'Connected', offline: 'Reconnecting to Telegram', revoked: 'Telegram needs attention', conflict: 'Telegram needs attention', 'storage-error': 'Telegram needs attention',
}

export async function telegramSettings(context: ChannelSettingsContext, request: ChannelScreenRequest): Promise<ChannelScreen> {
  const state = object(request.state)
  let step = text(state['step'])
  let mode: NonNullable<TelegramAction & { kind: 'connect' }>['mode'] = text(state['mode']) === 'team' ? 'team' : 'private'
  const next = typeof request.action === 'string' ? request.action : ''
  const value = context.viewed()
  let shown = value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as TelegramView
  const send = async (value: TelegramAction): Promise<void> => { shown = JSON.parse(JSON.stringify(await context.request({ kind: 'action', action: value as Json }))) as TelegramView }
  if (next === 'create') step = 'create'
  if (next === 'private' || next === 'team') { step = 'token'; mode = next }
  if (next === 'cancel') { if (shown?.pairing !== undefined) await send({ kind: 'cancel-pairing' }); step = '' }
  if (next === 'connect') {
    const token = request.values?.['token']
    if (typeof token !== 'string' || token.trim() === '') throw new Error('Enter your bot token.')
    const entered = request.values?.['approvers']
    const approvers = typeof entered === 'string' ? entered.split(',').map((one) => one.trim()).filter(Boolean).map(Number) : []
    if (mode === 'team' && (approvers.length > 100 || approvers.some((one) => !Number.isSafeInteger(one) || one <= 0))) throw new Error('Enter at most 100 positive Telegram user IDs separated by commas.')
    if (!context.setting().enabled) await context.configure({ enabled: true, manager: true })
    await send({ kind: 'connect', token: token.trim(), mode, ...(mode === 'team' ? { approvers, allMembers: request.values?.['allMembers'] === true } : {}) })
    step = ''
  }
  if (next === 'confirm' && shown?.candidate !== undefined) await send({ kind: 'confirm', userId: shown.candidate.id, chatId: shown.candidate.chatId })
  if (next === 'retry') await send({ kind: 'retry' })
  if (next === 'disconnect') { await send({ kind: 'disconnect' }); step = '' }
  if (next.startsWith('stop:')) await send({ kind: 'stop-link', id: next.slice(5) })
  shown ??= { state: 'disconnected', pendingLate: 0 }
  const current = shown
  const sections: NonNullable<ChannelScreen['sections']>[number][] = []
  const actions: ChannelScreenAction[] = []
  const details = [current.detail, current.bot === undefined ? undefined : `@${current.bot.username}`, current.account === undefined ? undefined : `${current.account.name} / Account ID ${String(current.account.id)}`, current.account?.team === undefined ? undefined : `${current.account.team.title} / Group ${String(current.account.chatId)} / Topic ${String(current.account.team.topicId)}`].filter((one): one is string => one !== undefined)
  if (step === 'create') {
    sections.push({ title: 'Create a bot', text: ['In Telegram, open the official @BotFather and send /newbot.', 'Choose a name, then a unique username ending in bot. Copy the API token BotFather gives you.'], actions: [{ label: 'Open BotFather', href: 'https://t.me/BotFather' }, action('Private account', 'private', true), action('Team topic', 'team'), action('Cancel', 'cancel')] })
  } else if (step === 'token') {
    sections.push({ title: mode === 'team' ? 'Connect a team topic' : 'Connect your account', text: ['Stored securely on this computer. Never shared with Manager or workers.', ...(mode === 'team' ? ['People in this topic can assign work on this computer using its access.', 'Approvals require verified membership. Answer in GeckIt when Telegram cannot verify it.'] : [])], fields: [
      { key: 'token', label: 'Bot token', type: 'secret', required: true },
      ...(mode === 'team' ? [{ key: 'approvers', label: 'Approver IDs', type: 'text' as const, help: 'Positive Telegram user IDs, separated by commas.' }, { key: 'allMembers', label: 'Allow approvals from all verified group members', type: 'boolean' as const }] : []),
    ], actions: [action('Continue', 'connect', true), action('Cancel', 'cancel')] })
  } else if (current.state === 'confirming' && current.candidate !== undefined) {
    const candidate = current.candidate
    sections.push({ title: candidate.team === undefined ? 'Is this your Telegram account?' : 'Connect this team topic?', text: [`${candidate.name}${candidate.username === undefined ? '' : ` / @${candidate.username}`}`, `Account ID: ${String(candidate.id)}`, ...(candidate.team === undefined ? [] : [`${candidate.team.title} / Group ${String(candidate.chatId)} / Topic ${String(candidate.team.topicId)}`])], actions: [action(candidate.team === undefined ? 'Connect account' : 'Connect topic', 'confirm', true), action('This is not me', 'cancel')] })
  } else if (current.pairing !== undefined) {
    sections.push({ title: 'Connect in Telegram', text: current.pairing.command === undefined ? ['Open your bot in Telegram and press Start. Then return here to confirm your account.', 'Pairing link expires in ten minutes.'] : ['Send this one-time command in the topic, then confirm it here:', current.pairing.command, 'Keep bot privacy enabled. Use addressed commands or replies to this bot.', 'Pairing link expires in ten minutes.'], actions: [{ label: 'Open Telegram', href: current.pairing.url }, action('Try again', 'retry'), action('Cancel', 'cancel')] })
  } else {
    actions.push(action(current.state === 'disconnected' ? 'Connect Telegram' : 'Change connection', 'create', true), action('I already have a bot', 'private'), action('Team topic', 'team'))
    if (current.state !== 'disconnected') actions.push(action('Try again', 'retry'), { label: 'Disconnect', action: 'disconnect', confirm: 'Disconnect Telegram? This account loses access. Workers continue; Manager settings and history are kept.' })
  }
  if (current.pendingLate > 0) details.push(`${String(current.pendingLate)} delayed requests need confirmation in Telegram.`)
  for (const link of current.links ?? []) sections.push({ title: link.title, text: [`Shared until ${new Date(link.expiresAt).toISOString()}`], actions: [{ label: 'Stop sharing', action: `stop:${link.id}`, confirm: `Stop sharing ${link.title}?` }] })
  sections.push({ title: 'Privacy', text: ["Your tasks and replies use Telegram's bot service. This is separate from GeckIt's encrypted phone connection."] })
  return { title: states[current.state], text: ['Keep this computer online with GeckIt running. Messages pass through Telegram.', ...details], state: { step, mode }, actions, sections }
}
