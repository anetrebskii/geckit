export interface DropCheck {
  readonly name: string
  readonly passed: boolean
  readonly detail: string
}

const settled = async (): Promise<void> => { await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))) }
const button = (label: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find((one) => (one.textContent ?? '').replace(one.querySelector('.keys')?.textContent ?? '', '').trim() === label)
  if (found === undefined) throw new Error(`Missing button: ${label}`)
  return found
}

export function dragOverFiles(target: Element): DataTransfer {
  const dataTransfer = new DataTransfer()
  dataTransfer.items.add(new File(['fixture alpha'], 'alpha report.txt', { type: 'text/plain' }))
  dataTransfer.items.add(new File(['fixture beta'], 'beta.txt', { type: 'text/plain' }))
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
  return dataTransfer
}

export function dropFiles(target: Element): void {
  const dataTransfer = dragOverFiles(target)
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
}

async function imageFile(): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  return new Promise<File>((done, fail) => canvas.toBlob((blob) => {
    if (blob === null) fail(new Error('Could not create fixture image'))
    else done(new File([blob], 'fixture.png', { type: 'image/png' }))
  }, 'image/png'))
}

const dropImage = (target: Element, file: File): void => {
  const dataTransfer = new DataTransfer()
  dataTransfer.items.add(file)
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
}

export async function runDropRegression(): Promise<readonly DropCheck[]> {
  const checks: DropCheck[] = []
  const check = (name: string, passed: boolean, detail: string): void => { checks.push({ name, passed, detail }) }
  const draft = (): string => localStorage.getItem('drafts') ?? '{}'
  if (document.querySelector('.new-task') !== null) { button('Cancel').click(); await settled() }
  const background = draft()
  const image = await imageFile()
  const backgroundPictures = (): number => document.querySelectorAll('.composer .pending-one img').length
  const picturesBefore = backgroundPictures()
  for (const kind of ['New task', 'Ask a question']) {
    button('New task').click()
    await settled()
    if (kind === 'Ask a question') { button('Ask a question').click(); await settled() }
    const field = document.querySelector<HTMLTextAreaElement>('.new-task-text')
    if (field === null) throw new Error('Missing form field')
    const before = field.value
    const files = dragOverFiles(field)
    await settled()
    check(`${kind}: background drag highlight absent during dragover`, document.querySelector('.chat.dropping') === null, document.querySelector('.chat')?.className ?? '')
    field.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: files }))
    await settled()
    check(`${kind}: multiple files stay in the form`, field.value.startsWith(before) && field.value.includes('alpha report.txt') && field.value.includes('beta.txt'), field.value)
    check(`${kind}: space-containing path remains quoted`, field.value.includes('"C:\\Fixtures\\alpha report.txt"'), field.value)
    check(`${kind}: background draft unchanged`, draft() === background, draft())
    check(`${kind}: background drag highlight absent`, document.querySelector('.chat.dropping') === null, document.querySelector('.chat')?.className ?? '')
    for (const selector of ['.new-task-goal', '.new-task-head', '.form-scrim', '.chat']) {
      const target = document.querySelector(selector)
      if (target === null) continue
      const formBefore = field.value
      dropFiles(target)
      await settled()
      check(`${kind}: ${selector} ignores file drop`, draft() === background && field.value === formBefore, draft())
    }
    dropImage(field, image)
    const deadline = Date.now() + 2000
    while (document.querySelector('.new-task .pending-one img') === null && Date.now() < deadline) await settled()
    check(`${kind}: supported image stays in the form`, document.querySelector('.new-task .pending-one img') !== null && backgroundPictures() === picturesBefore, `background pictures: ${String(backgroundPictures())}`)
    button('Cancel').click()
    await settled()
    check(`${kind}: cancel does not replay`, draft() === background, draft())
  }
  for (let cycle = 0; cycle < 2; cycle++) {
    button('New task').click()
    await settled()
    const field = document.querySelector('.new-task-text')
    if (field === null) throw new Error('Missing reopened form')
    dropFiles(field)
    await settled()
    button('Cancel').click()
    await settled()
    check(`Repeated reopen/cancel ${String(cycle + 1)}`, draft() === background, draft())
  }
  for (const close of ['Escape', 'backdrop']) {
    button('New task').click()
    await settled()
    const field = document.querySelector('.new-task-text')
    if (field === null) throw new Error('Missing form for close check')
    dropFiles(field)
    dropImage(field, image)
    if (close === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    else document.querySelector('.form-scrim')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await settled()
    check(`${close} closes without replaying files or pending image conversion`, document.querySelector('.new-task') === null && draft() === background && backgroundPictures() === picturesBefore, draft())
  }
  const chat = document.querySelector('.chat')
  if (chat === null) throw new Error('Missing Chat root')
  dropFiles(chat)
  await settled()
  check('No-modal drop still edits conversation draft', draft() !== background && draft().includes('alpha report.txt') && draft().includes('beta.txt'), draft())
  return checks
}
