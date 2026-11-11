import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { TelegramAction, TelegramView } from '../../../shared/telegram'

const expiry = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

function Members({ view, action, busy }: { readonly view: TelegramView; readonly action: (action: TelegramAction) => Promise<void>; readonly busy: boolean }): React.JSX.Element | null {
  const [projects, setProjects] = useState((view.members?.projects ?? []).join('\n'))
  const [memberProjects, setMemberProjects] = useState<Readonly<Record<string, string>>>({})
  const [showRevoked, setShowRevoked] = useState(false)
  const [approve, setApprove] = useState<Readonly<Record<string, boolean>>>({})
  const status = useRef<HTMLParagraphElement>(null)
  const restoreFocus = useRef(false)
  const run = useCallback((next: TelegramAction) => { restoreFocus.current = true; void action(next) }, [action])
  useEffect(() => { if (restoreFocus.current && !busy) { restoreFocus.current = false; status.current?.focus() } }, [view, busy])
  const state = view.members
  if (view.account?.team === undefined) return null
  return <div className="manager-members">
    <h3>Team direct messages</h3>
    <p>One bot can serve this topic and admitted private chats at the same time. Each participant has their own conversation and tasks. Work uses this computer&apos;s access; it is not an isolated system account. The installation owner can read its history.</p>
    <form onSubmit={(event) => { event.preventDefault(); run({ kind: 'members-configure', enabled: true, projects: projects.split('\n').map((one) => one.trim()).filter(Boolean) }) }}>
      <label htmlFor="telegram-member-projects">Allowed registered project roots (one per line)</label>
      <textarea id="telegram-member-projects" rows={3} value={projects} disabled={busy} onChange={(event) => setProjects(event.target.value)} />
      <p>Only listed projects are available. Changing this list or disabling direct messages revokes existing private access. Invite participants again to grant fresh access.</p>
      <div className="manager-actions"><button type="submit" disabled={busy}>Enable / save projects</button>{state?.enabled !== true ? null : <button type="button" disabled={busy} onClick={() => { run({ kind: 'members-configure', enabled: false, projects: state.projects }) }}>Disable direct messages</button>}</div>
    </form>
    <p ref={status} role="status" tabIndex={-1}>{state?.enabled === true ? 'Direct messages enabled' : 'Direct messages disabled'}</p>
    {state?.enabled !== true ? null : <button type="button" disabled={busy} onClick={() => { run({ kind: 'members-invite' }) }}>Create invitation</button>}
    <ul>{(state?.invites ?? []).map((invite) => <li key={invite.id} onKeyDown={(event) => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); run({ kind: 'members-cancel', id: invite.id }) } }}>
      <p>One-use invitation. Expires {expiry.format(invite.expiresAt)}.</p><p><a href={invite.url} onClick={(event) => { event.preventDefault(); window.geckit.chat.openLink(invite.url) }}>{invite.url}</a></p>
      {invite.candidate === undefined ? <p>Waiting for participant to press Start.</p> : <><p>Confirm {invite.candidate.name} / ID {invite.candidate.id}{invite.candidate.username === undefined ? '' : ` / @${invite.candidate.username}`}?</p><label><input type="checkbox" checked={approve[invite.id] === true} disabled={busy} onChange={(event) => setApprove({ ...approve, [invite.id]: event.target.checked })} />May approve own private tasks</label><label>Projects for this participant (one per line)<textarea rows={2} disabled={busy} value={memberProjects[invite.id] ?? (state?.projects ?? []).join('\n')} onChange={(event) => setMemberProjects({ ...memberProjects, [invite.id]: event.target.value })} /></label><button type="button" disabled={busy} onClick={() => { run({ kind: 'members-confirm', id: invite.id, userId: invite.candidate!.id, approve: approve[invite.id] === true, projects: (memberProjects[invite.id] ?? (state?.projects ?? []).join('\n')).split('\n').map((one) => one.trim()).filter(Boolean) }) }}>Admit this participant</button></>}
      <button type="button" disabled={busy} onClick={() => { run({ kind: 'members-cancel', id: invite.id }) }}>Cancel invitation</button>
    </li>)}</ul>
    <p>Leaving the group does not revoke private access. Revoke it here.</p>
    <button type="button" onClick={() => setShowRevoked(!showRevoked)}>{showRevoked ? 'Hide revoked participants' : 'Show revoked participants'}</button>
    <ul aria-label="Private participants">{(state?.people ?? []).filter((one) => one.active || showRevoked).map((person) => <MemberRow key={person.id} person={person} busy={busy} run={run} />)}</ul>
  </div>
}

export const TelegramMembers = memo(Members)

type Person = NonNullable<TelegramView['members']>['people'][number]
const MemberRow = memo(function MemberRow({ person, busy, run }: { readonly person: Person; readonly busy: boolean; readonly run: (next: TelegramAction) => void }): React.JSX.Element {
  return <li><p>{person.account.name} / ID {person.account.id} / {person.active ? 'Admitted' : 'Revoked'} / {person.approve ? 'May approve own tasks' : 'Owner answers approvals'}</p><p>{person.pending ?? 0} waiting requests / {person.uncertain ?? 0} unconfirmed deliveries. Projects: {(person.projects ?? []).join(', ') || 'None'}.</p>{person.detail === undefined ? null : <p role="alert">{person.detail}</p>}{!person.active ? null : <button type="button" className="quiet danger" disabled={busy} onClick={() => { run({ kind: 'members-revoke', id: person.id }) }}>Revoke access and stop this participant&apos;s work</button>}</li>
})
