import type { ChannelScreen, ChannelScreenRequest } from '../../shared/channel-ui'
import type { Json } from './channel-api'
import type { ChannelSettingsContext } from './channel-api'
import { DISCORD_PORTAL } from '../../shared/discord'
import type { DiscordSetupView } from '../../shared/discord'

export async function discordSettings(context: ChannelSettingsContext, request: ChannelScreenRequest): Promise<ChannelScreen> {
  const sections: NonNullable<ChannelScreen['sections']>[number][] = [{ title: 'Connect the bot', text: ['Create an application in the Discord Developer Portal. Under Bot, turn on Message Content Intent, then Reset Token and paste it here.'], actions: [{ label: 'Open Developer Portal', href: DISCORD_PORTAL }] }]
  const token = request.values?.['token']
  const action = request.action
  if (action === 'save') {
    const fields = context.setting().info.fields.filter((field) => field.type !== 'secret')
    await context.configure({ config: Object.fromEntries(fields.map((field) => [field.key, request.values?.[field.key] ?? field.default ?? (field.type === 'boolean' ? false : field.type === 'list' ? [] : '')])) })
  }
  if (action === 'forget') await context.configure({ secrets: { botToken: null } })
  let found: DiscordSetupView | undefined
  if (action === 'connect' || action === 'check') {
    const entered = typeof token === 'string' ? token.trim() : ''
    if (entered === '' && context.secret('botToken') === undefined) throw new Error('Enter your bot token.')
    const allow = context.config()['allow']
    found = await context.inspect({ ...(entered === '' ? {} : { token: entered }), people: Array.isArray(allow) ? allow : [] }) as DiscordSetupView
    if (found.token === 'refused') throw new Error('Discord did not accept this token. Reset it in the Developer Portal and paste the new one.')
    if (found.token === 'ok' && entered !== '') await context.configure({ secrets: { botToken: entered } })
  } else if (action !== 'forget' && request.state !== null && typeof request.state === 'object' && !Array.isArray(request.state) && 'token' in request.state) found = request.state as DiscordSetupView
  sections.push({ fields: [{ key: 'token', label: context.secret('botToken') === undefined ? 'Bot token' : 'Replace bot token', type: 'secret', ...(context.secret('botToken') === undefined ? {} : { help: 'Leave empty to check the saved token. A new one is saved once Discord accepts it.' }) }], actions: [{ label: context.secret('botToken') === undefined ? 'Check and save token' : 'Check connection', action: 'connect', primary: true }, ...(context.secret('botToken') === undefined ? [] : [{ label: 'Forget token', action: 'forget', confirm: 'Forget the saved bot token? Discord will stop until a token is saved.' }])] })
  if (found?.token === 'ok') {
    sections.push({ title: found.bot.name, text: ['Token checked', found.messageContent ? 'Message Content Intent is on.' : 'Message Content Intent is off. Enable it under Bot, Privileged Gateway Intents.'], actions: [{ label: 'Open Bot settings', href: `${DISCORD_PORTAL}/${found.application}/bot` }, { label: 'Add to server', href: found.invite }] })
    sections.push({ title: 'Servers and channels', text: found.servers.length === 0 ? ['The bot is not in a server yet. Add it to one you manage.'] : found.servers.flatMap((server) => [server.name, ...(server.unreadable === true ? ['Cannot list its channels.'] : server.channels.map((channel) => `#${channel.name} / ${channel.id}`))]) })
    sections.push({ title: 'People who may write', text: found.people.length === 0 ? ['Nobody yet. Add Discord user IDs below, save, then check again.'] : found.people.map((person) => person.found ? `${person.name} / ${person.id}${person.bot === true ? ' / Bots are never answered.' : ''}` : `${person.id} / Discord has no user with this ID`) })
  }
  sections.push({ title: 'Who may use the bot', fields: context.setting().info.fields.filter((field) => field.type !== 'secret').map((field) => ({ ...field, default: context.config()[field.key] ?? field.default ?? (field.type === 'boolean' ? false : field.type === 'list' ? [] : '') })), actions: [{ label: 'Save channel settings', action: 'save', primary: true }] })
  return { title: 'Discord connection', sections, ...(found === undefined ? {} : { state: JSON.parse(JSON.stringify(found)) as Json }) }
}
