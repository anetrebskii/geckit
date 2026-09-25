import { useEffect } from 'react'

import { ANYWHERE } from '../../../shared/api'

/** Every key the application answers to, in one place. */

const MAC = window.geckit.platform === 'darwin'

/** What the keyboard in front of the person calls the command key. */
export const MOD = MAC ? 'Cmd' : 'Ctrl'

export const said = (accelerator: string): string => accelerator.replace('CommandOrControl', MOD)

const GROUPS: readonly { readonly title: string; readonly keys: readonly (readonly [string, string])[] }[] = [
  {
    title: 'In any application',
    keys: [
      [said(ANYWHERE.correct), `Correct the selected text: hold ${MOD}, press C, then D`],
      [said(ANYWHERE.dictate), 'Dictate into what you are typing in; again to stop and paste'],
      [said(ANYWHERE.search), 'Search conversations; again to put the search away'],
      [said(ANYWHERE.orders), 'Say what to do: start a conversation, answer one, mark one; again to stop talking'],
    ],
  },
  {
    title: 'Chat',
    keys: [
      [`${MOD}+N`, 'New conversation'],
      [`${MOD}+Shift+N`, 'Ask a general question, kept off the board'],
      [`${MOD}+P`, 'Search conversations, projects, folders and what was said'],
      [`${MOD}+K`, 'Switch project: type a few letters of it, then Enter'],
      [`${MOD}+1 to ${MOD}+9`, `Open the conversation at that place in the list, favorites first; hold ${MOD} to see the numbers`],
      ['Ctrl+Tab, Ctrl+Shift+Tab', 'Switch to a conversation opened lately: hold Ctrl, press Tab to move, let go to open'],
      [`${MOD}+Alt+Down, ${MOD}+Alt+Up`, 'Next and previous conversation in the list'],
      ['F2', 'Rename the conversation; or click its name at the top'],
      [`${MOD}+click, Shift+click`, 'Select several conversations; Delete deletes them, Esc lets them go'],
      [`${MOD}+R`, 'Refresh'],
      ['Enter', 'Send'],
      ['Shift+Enter', 'New line'],
    ['Up, Down', 'What you said before in this conversation, from the first line of the field'],
      [`Esc, ${MOD}+.`, 'Stop the answer; over the board Esc puts the conversation away instead'],
    ['Ctrl+B', 'Run the command Claude is waiting on in the background'],
      [`${MOD}+click a file`, MAC ? 'Show it in the Finder' : 'Show it in its folder'],
      ['Right-click a file', 'Choose what opens it'],
      [`${MOD}+J`, 'Shortcuts: saved prompts to run by hand or on a timetable'],
      [`${MOD}+,`, 'Settings'],
      [`${MOD}+/`, 'These shortcuts'],
    ],
  },
  {
    title: 'Search',
    keys: [
      ['Down, Up', 'Move through what was found'],
      ['Enter', 'Open it'],
      ['Esc', 'Close'],
    ],
  },
  {
    title: 'In the background, opened under the field or by typing /tasks',
    keys: [
      ['Down, Up', 'Move through what runs and what has ended'],
      ['Enter', 'Open it: how it stands, what it runs, what it printed'],
      ['X', 'Stop it while it runs, clear it once it has ended'],
      ['Left', 'Back to the list'],
      ['Esc', 'Close'],
    ],
  },
  {
    title: 'A picture, opened',
    keys: [
      ['+, -', 'Bigger, smaller'],
      ['0', 'Fit the window'],
      ['Esc', 'Close'],
    ],
  },
  {
    title: 'Correct and Transcribe',
    keys: [
      ['Ctrl+1, Ctrl+2', 'Correct, Transcribe'],
      [`${MOD}+1 to ${MOD}+4`, 'Grammar, Improve, Translate, Explain'],
      [`${MOD}+0`, 'Custom'],
      [`${MOD}+Z`, 'Put the text back'],
      [`${MOD}+,`, 'Settings'],
      [`${MOD}+/`, 'These shortcuts'],
    ],
  },
  {
    title: 'While dictating',
    keys: [
      ['Enter', 'Stop and paste'],
      ['Esc', 'Cancel'],
    ],
  },
]

export function ShortcutsDialog({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog shortcuts" onMouseDown={(event) => event.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.keys.map(([keys, does]) => (
                <div key={keys}>
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{does}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <div className="dialog-actions">
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
