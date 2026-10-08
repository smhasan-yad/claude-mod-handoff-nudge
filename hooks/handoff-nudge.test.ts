import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const ok = (value: unknown) => ({ value }) as never

function world(on: On, percent: number) {
  mock.clock(on, { now: Date.parse('2026-10-08T12:00:00Z') })
  const filled: string[] = []
  on('command.list', async () => ok([{ name: 'handoff-journal', description: 'x', source: 'user' }, { name: 'handoff-local', description: 'x', source: 'user' }]))
  on('session.usage', async () => ok({ startedAt: Date.parse('2026-10-08T11:00:00Z'), context: { window: 1000000, percent }, rateLimits: [] }))
  on('prompt.read', async () => ok({ text: '', cursor: 0 }))
  on('prompt.fill', async ($, e) => {
    filled.push(e.text)
    return { isFilled: true } as never
  })
  on('ui.invalidate', async () => ok(undefined))
  on('session.start', async () => ({ cwd: 'C:\\repo' }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }) as never)
  return filled
}

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never } as const
const complete = { turnId: 't1', answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer', text: 'ok' } as never

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: at 62% context the nudge shows, and a button puts the skill in the message box`, async ($, on) => {
    const filled = world(on, 62)
    await $.session.start({ source: 'startup', cwd: 'C:\\repo', surface, isInteractive: true } as never)
    await $.turn.complete(complete)
    let ui = await $.ui.mount({ plugin: 'handoff-nudge', surface, ...BAND })
    expect((await ui.findAll({ type: 'Text' })).map(t => String(t.text))).toContain('📝 Context is 62% full. Save a handoff?')
    expect((await ui.findAll({ type: 'Button' })).map(b => b.props.label)).toEqual(['/handoff-journal', '/handoff-local', 'Later'])
    await ui.press({ key: 'h-handoff-journal' })
    await ui.unmount()
    expect(filled).toEqual(['/handoff-journal '])
    ui = await $.ui.mount({ plugin: 'handoff-nudge', surface, ...BAND })
    expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
    await ui.unmount()
  })
}

test('below 60% nothing shows', async ($, on) => {
  world(on, 40)
  await $.session.start({ source: 'startup', cwd: 'C:\\repo', surface: 'desktop', isInteractive: true } as never)
  await $.turn.complete(complete)
  const ui = await $.ui.mount({ plugin: 'handoff-nudge', surface: 'desktop', ...BAND })
  expect((await ui.findAll({ type: 'Button' })).length).toBe(0)
  await ui.unmount()
})
