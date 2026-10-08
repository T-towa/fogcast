import { test, expect, mock } from 'claude-code/testing'
import { linkFor, summarize, outline, fileChange, todosOf, statusLine, textOf, rel, older, midTurnText, questionsOf, answersFor, keepText } from './shape'

// ---------------------------------------------------------------- shape

test('a tool call counts toward the right card', () => {
  expect(linkFor('Read', { file_path: '/a' })).toEqual({ id: 'Read', kind: 'tool', label: 'Read', src: '組み込み' })
  expect(linkFor('Skill', { skill: 'frontend-design' }).id).toBe('skill:frontend-design')
  expect(linkFor('Agent', { subagent_type: 'Explore', description: 'x' }).id).toBe('agent:Explore')
  expect(linkFor('Agent', {}).id).toBe('agent:general-purpose')
  expect(linkFor('mcp__claude_ai__conversation_search', {}).id).toBe('mcp:claude_ai')
  expect(linkFor('TaskUpdate', {}).id).toBe('Tasks')
})

test('a call is described in one line, paths relative to the session', () => {
  expect(summarize('Read', { file_path: '/w/app/src/a.ts' }, '/w/app')).toBe('src/a.ts')
  expect(summarize('Bash', { command: 'npm test\necho done' }, '/w')).toBe('npm test')
  expect(summarize('Grep', { pattern: 'TODO', path: '/w/app/src' }, '/w/app')).toBe('"TODO" in src')
  expect(summarize('Agent', { subagent_type: 'Explore', description: 'find the router' }, '/w')).toBe('Explore：find the router')
  expect(summarize('mcp__github__get_issue', { repo: 'a/b', number: 4 }, '/w')).toBe('get_issue a/b')
  expect(summarize('WebFetch', { url: 'https://example.com/docs/x' }, '/w')).toBe('example.com/docs/x')
  expect(rel('/elsewhere/x', '/w')).toBe('/elsewhere/x')
})

test('a finished call is summed up in a few words', () => {
  expect(outline('Read', { text: 'a\nb\nc\n' })).toBe('3 行')
  expect(outline('Bash', { text: 'running...\n22 passed\n' })).toBe('22 passed')
  expect(outline('Bash', { deny: 'no' })).toBe('拒否')
  expect(outline('Edit', { isError: true, text: 'old_string not found' })).toBe('エラー：old_string not found')
})

test('file changes and task lists are read off the calls', () => {
  expect(fileChange('Edit', { file_path: '/w/a.ts', old_string: 'x\ny', new_string: 'x\ny\nz' }, '/w')).toEqual({ path: 'a.ts', add: 3, del: 2 })
  expect(fileChange('Write', { file_path: '/w/b.md', content: 'one\ntwo\n' }, '/w')).toEqual({ path: 'b.md', add: 2, del: 0 })
  expect(fileChange('Read', { file_path: '/w/b.md' }, '/w')).toBe(null)
  expect(todosOf('TodoWrite', { todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }, { content: 'c', status: 'pending' }] }))
    .toEqual([{ t: 'a', st: 'done' }, { t: 'b', st: 'doing' }, { t: 'c', st: 'todo' }])
  expect(textOf([{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'hello' }])).toBe('hello')
})

test('the status line', () => {
  expect(statusLine({ num: 2, ready: true, ctx: 41, limits: [{ kind: 'five_hour', percentUsed: 44 }, { kind: 'seven_day', percentUsed: 68 }], usd: 1.234, forecast: { pc: 44, proj: 71 } }))
    .toBe('Fogcast ch.2 · ctx 41% · 5h 44% → 予報 71% · 7d 68% · $1.23 · /fog で画面')
  expect(statusLine({ num: 0, ready: false, limits: [], forecast: null })).toBe('Fogcast 未接続 · /fog で画面')
  expect(statusLine({ num: 1, ready: true, ctx: 12, limits: [], forecast: null, pair: '4821-0937' }))
    .toBe('Fogcast ch.1 · 合言葉 4821-0937（Fogcast の画面に入力） · ctx 12% · /fog で画面')
})

test('versions are compared part by part', () => {
  expect(older('0.1.0', '0.1.1')).toBe(true)
  expect(older('0.1.10', '0.1.9')).toBe(false)
  expect(older('0.2.0', '0.1.9')).toBe(false)
  expect(older('0.1.1', '0.1.1')).toBe(false)
  expect(older(undefined, '0.1.1')).toBe(false)
})

// ---------------------------------------------------------------- the session, against a hub in memory

const TOKEN = 'ab'.repeat(24)
type Any = any
function hub(on: Any, opts: { approvals?: boolean; decision?: string; wait?: () => Promise<string | null>; pair?: () => Any; version?: () => string | null; opened?: boolean } = {}) {
  const h = { posts: [] as Any[], events: [] as Any[], queue: [] as Any[], asked: [] as Any[] }
  on('http.fetch', (_$: Any, e: Any) => {
    const path = e.url.replace('http://127.0.0.1:4317', '')
    const body = e.init?.body ? JSON.parse(e.init.body) : null
    const ok = (v: unknown) => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(v) } })
    if (path === '/api/health') {
      const v = opts.version ? opts.version() : '0.4.0'
      return v === null ? { value: { status: 502, ok: false, headers: {}, text: '' } } : ok({ ok: true, app: 'fogcast', version: v })
    }
    if (e.init?.headers?.['x-fogcast-token'] !== TOKEN) return { value: { status: 401, ok: false, headers: {}, text: '{}' } }
    h.posts.push({ path, body })
    const pair = opts.pair ? opts.pair() : null
    if (path === '/api/mod/hello') return ok({ ok: true, num: 3, approvals: { on: !!opts.approvals }, pair })
    if (path === '/api/mod/sync') { h.events.push(...body.events); return ok({ ok: true, num: 3, commands: h.queue.splice(0), approvals: { on: !!opts.approvals }, pair }) }
    if (path === '/api/mod/ask') { h.asked.push(body); return ok({ mode: 'screen', exp: Date.now() + 120000 }) }
    if (path === '/api/mod/open') return ok({ opened: !!opts.opened })
    if (path === '/api/mod/ask/wait') return opts.wait ? opts.wait().then(decision => ok({ decision })) : ok({ decision: opts.decision ?? 'allow' })
    return ok({ ok: true })
  })
  return h
}
function engine(on: Any, skip: string[] = [], env: Record<string, string> = {}, more: { commands?: Any[]; dirs?: Record<string, Any[]> } = {}) {
  const real = on; on = (name: string, ...rest: Any[]) => (skip.includes(name) ? undefined : real(name, ...rest))
  mock.env(real, { HOME: '/home/t', ...env })
  on('fs.read', () => ({ value: TOKEN }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.cwd', () => ({ value: '/home/t/dev/shop' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.version', () => ({ value: { version: '2.1.291', base: '2.1.291' } }))
  on('session.usage', () => ({ value: { startedAt: 1, context: { window: 200000, tokens: 1000, percent: 1, breakdown: {
    categories: [{ name: 'System prompt', tokens: 3000, color: 'x', isDeferred: false, kind: 'used' }],
    totalTokens: 3000, maxTokens: 200000, rawMaxTokens: 200000, autocompactSource: 'model', percentage: 1, gridRows: [], model: 'm',
    memoryFiles: [{ path: '/home/t/dev/shop/CLAUDE.md', type: 'Project', tokens: 900 }],
    mcpTools: [{ name: 'mcp__github__get_issue', serverName: 'github', tokens: 400, isLoaded: true }],
    agents: [{ agentType: 'reviewer', source: 'projectSettings', tokens: 70 }],
    skills: { totalSkills: 2, includedSkills: 2, tokens: 300, skillFrontmatter: [{ name: 'api-conventions', source: 'projectSettings', tokens: 120 }, { name: 'dataviz', source: 'userSettings', tokens: 180 }] },
    isAutoCompactEnabled: true, apiUsage: null } }, rateLimits: [] } }))
  on('command.list', () => ({ value: [{ name: 'compact', description: '会話を圧縮', source: 'builtin' }, ...(more.commands ?? [])] }))
  on('fs.list', (_$: Any, e: Any) => { const k = Object.keys(more.dirs ?? {}).find(d => String(e.path).endsWith(d)); return { value: k ? more.dirs![k] : [] } })
  on('command.register', (_$: Any, e: Any) => ({ value: { command: e.name } }))
  for (const ui of ['ui.status', 'ui.toast', 'ui.invalidate']) on(ui, () => ({ value: undefined }))
  on('session.start', (_$: Any, e: Any) => ({ cwd: e.cwd }))
  on('turn.start', (_$: Any, e: Any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.measure', (_$: Any, e: Any) => ({ changed: e.changed }))
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', () => ({ result: { stdout: '22 passed', stderr: '' }, text: '22 passed' }))
  on('session.end', (_$: Any, e: Any) => ({ sessionId: e.sessionId }))
}
async function started($: Any, on: Any, clock: Any) {
  await $.session.start({ cwd: '/home/t/dev/shop', surface: 'terminal', isInteractive: true })
  await clock.advance(700)    // first tick: finds the hub, says hello
  await clock.advance(700)    // second: syncs
}

test('a session says hello with what it loaded, then reports a turn', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  await started($, on, clock)
  const hello = h.posts.find(p => p.path === '/api/mod/hello')!.body
  expect(hello.cwd).toBe('/home/t/dev/shop')
  expect(hello.branch).toBe('main')
  expect(hello.loaded.skills).toEqual([{ n: 'api-conventions', src: '.claude', dt: 120 }, { n: 'dataviz', src: '~/.claude', dt: 180 }])
  expect(hello.loaded.mcp).toEqual(['github'])
  expect(hello.links.map((l: Any) => l.id)).toEqual(['skill:api-conventions', 'agent:reviewer', 'mcp:github'])
  expect(hello.commands[0].name).toBe('compact')

  await $.session.measure({ context: { window: 200000, tokens: 50000, percent: 25 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }], changed: ['context'] })
  await $.turn.start({ text: 'テストを直して', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.turn.complete({ answer: '直しました', durationMs: 1200, isAborted: false, turnId: 't1', reason: 'answer', usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: 'm' } })
  await clock.advance(700)
  const ks = h.events.map(e => e.k)
  expect(ks).toEqual(expect.arrayContaining(['measure', 'turn', 'tool', 'toolEnd', 'turnEnd']))
  const tool = h.events.find(e => e.k === 'tool')
  expect(tool.name).toBe('Bash'); expect(tool.input).toBe('npm test'); expect(tool.link.id).toBe('Bash')
  expect(h.events.find(e => e.k === 'toolEnd').out).toBe('22 passed')
  expect(h.events.find(e => e.k === 'turn').text).toBe('テストを直して')
})

test('what the screen sends is run in the terminal', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  const submitted: Any[] = [], ran: Any[] = []
  on('prompt.submit', (_$: Any, e: Any) => { submitted.push(e); return { text: e.text } })
  on('command.run', (_$: Any, e: Any) => { ran.push(e); return { text: 'ok' } })
  await started($, on, clock)
  h.queue.push({ id: 'c1', type: 'prompt', text: '続けて' }, { id: 'c2', type: 'command', name: 'context', args: '' })
  await clock.advance(700)
  await clock.settle()
  expect(submitted.map(e => e.text)).toEqual(['続けて'])
  expect(ran.map(e => e.command)).toEqual(['context'])
})

test('a dialog stays in the terminal unless the screen was paired', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on, { approvals: false })
  on('classic.PermissionRequest', () => ({}))
  await started($, on, clock)
  await $.turn.start({ text: 'push', turnId: 't2' })
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' } })
  expect(r.decision).toBe(undefined)
  expect(h.asked.length).toBe(0)
  await clock.advance(700)
  expect(h.events.some(e => e.k === 'wait' && e.input === 'git push')).toBe(true)
})

test('a paired screen can allow a call', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, ['tool.call'])
  let resolveCall: (v: Any) => void = () => {}
  on('tool.call', () => new Promise(res => { resolveCall = res }))
  const h = hub(on, { approvals: true, decision: 'allow' })
  on('classic.PermissionRequest', () => ({}))
  await started($, on, clock)
  await $.turn.start({ text: 'deploy', turnId: 't3' })
  const call = $.tool.call({ tool: 'Bash', command: 'make deploy' })
  await clock.settle()
  const r = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'make deploy' } })
  expect(r.decision).toEqual({ behavior: 'allow' })
  expect(h.asked[0].input).toBe('make deploy')
  resolveCall({ result: { stdout: '', stderr: '' }, text: 'done' })
  await call
  await clock.advance(700)
  expect(h.events.some(e => e.k === 'run' && e.how === 'screen')).toBe(true)
})

test('/fog answers without the key in its text', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, ['ui.toast']); hub(on)
  const toasts: string[] = []
  on('ui.toast', (_$: Any, e: Any) => { toasts.push(e.text); return { value: undefined } })
  await started($, on, clock)
  const r = await $.command.run({ command: 'fog' })
  expect(r.text).not.toContain(TOKEN)
  expect(r.text).not.toMatch(/https?:\/\//)            // no link in the stored line: the keyed one is drawn below it
  expect(r.text).toContain('開けませんでした')          // the hub found no browser: say so
  expect(toasts.some(t => t.includes('ブラウザを開けませんでした'))).toBe(true)
  expect(toasts.some(t => t.includes(TOKEN))).toBe(false)       // a notice cuts a long line short: the row under /fog carries it
})

test('/fog says it opened the screen only when the hub did', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); hub(on, { opened: true })
  await started($, on, clock)
  const r = await $.command.run({ command: 'fog' })
  expect(r.text).toContain('開きました')
  expect(r.text).not.toContain(TOKEN)
})

test('under WSL, the terminal that ran /fog opens the Windows browser itself, key and all', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, ['process.run'], { WSL_DISTRO_NAME: 'Ubuntu' })
  const runs: string[][] = []
  on('process.run', (_$: Any, e: Any) => { runs.push([...e.argv]); return { value: { exitCode: 0, stdout: 'main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  const hb = hub(on, { opened: false })
  await started($, on, clock)
  const r = await $.command.run({ command: 'fog' })
  expect(runs.find(a => a[0] === 'rundll32.exe')).toEqual(['rundll32.exe', 'url.dll,FileProtocolHandler', `http://127.0.0.1:4317/#k=${TOKEN}`])
  expect(hb.posts.some(p => p.path === '/api/mod/open')).toBe(false)
  expect(r.text).toContain('開きました')
})

test('while the screen holds an approval, the terminal shows a band that hands it back', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, ['tool.call'])
  let resolveCall: (v: Any) => void = () => {}
  on('tool.call', () => new Promise(res => { resolveCall = res }))
  let answer: (d: string) => void = () => {}
  const answered = new Promise<string>(res => { answer = res })     // the hub holds the request until someone answers
  const h = hub(on, { approvals: true, wait: () => answered })
  on('classic.PermissionRequest', () => ({}))
  await started($, on, clock)
  await $.turn.start({ text: 'deploy', turnId: 't4' })
  const call = $.tool.call({ tool: 'Bash', command: 'make deploy' })
  await clock.settle()
  const asking = $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'make deploy' } })
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'fogcast', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 9 }, view: {} } })
    expect(await ui.find({ type: 'Text', text: /Fogcast の画面で承認を待っています/ })).toBeDefined()
    expect(await ui.find({ key: 'fogcast-here' })).toBeDefined()
    if (surface === 'desktop') { await ui.press({ key: 'fogcast-here' }); answer('terminal') }
    await ui.unmount()
  }
  const r = await asking
  expect(r.decision).toBe(undefined)
  expect(h.posts.some(p => p.path === '/api/mod/ask/answer' && p.body.decision === 'terminal')).toBe(true)
  resolveCall({ result: { stdout: '', stderr: '' }, text: 'ok' })
  await call
})

const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 9 }, view: {} }

test('a pairing code is framed above the prompt and led in the status line, and can be taken back there', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, ['ui.status', 'ui.toast'])
  const statuses: string[] = [], toasts: string[] = []
  on('ui.status', (_$: Any, e: Any) => { statuses.push(e.text); return { value: undefined } })
  on('ui.toast', (_$: Any, e: Any) => { toasts.push(e.text); return { value: undefined } })
  on('ui.render', ($$: Any, e: Any) => h(($$.ui.resolve(e) as Any).Box, {}))   // what the engine draws there when no plugin does
  let pair: Any = null
  const hb = hub(on, { pair: () => pair })
  await started($, on, clock)
  pair = { code: '4821-0937', exp: Date.now() + 300000 }
  await clock.advance(2100)                 // a quiet terminal syncs every ~2 s
  expect(statuses[statuses.length - 1]).toContain('合言葉 4821-0937')
  expect(toasts.some(t => t.includes('入力欄のすぐ上'))).toBe(true)
  expect(toasts.some(t => t.includes('4821-0937'))).toBe(false)        // a notice could outlive the code
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'fogcast', surface, component: 'AbovePrompt', props: BAND_PROPS })
    expect(await ui.find({ type: 'Text', text: /ブラウザ承認の合言葉/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /4821-0937/ })).toBeDefined()
    if (surface === 'desktop') await ui.press({ key: 'fogcast-pair-cancel' })
    await ui.unmount()
  }
  await clock.settle()
  expect(hb.posts.some(p => p.path === '/api/mod/pair/cancel' && p.body.code === '4821-0937')).toBe(true)
  expect(statuses[statuses.length - 1]).not.toContain('合言葉')
  // the hub stops handing it out: nothing comes back
  pair = null
  await clock.advance(2100)
  const ui = await $.ui.mount({ plugin: 'fogcast', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  expect(await ui.find({ type: 'Text', text: /ブラウザ承認の合言葉/ })).toBe(undefined)
  await ui.unmount()
})

test('a hub left running from an older version is stopped once, and this version starts its own', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, ['process.run'])
  let version: string | null = '0.1.0'
  const runs: string[][] = []
  on('process.run', (_$: Any, e: Any) => {
    runs.push([...e.argv])
    if (e.argv.includes('--stop')) version = null
    if (e.argv.includes('--daemon')) version = '0.4.0'
    return { value: { exitCode: 0, stdout: 'main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  hub(on, { version: () => version })
  await $.session.start({ cwd: '/home/t/dev/shop', surface: 'terminal', isInteractive: true })
  await clock.advance(700)
  await clock.advance(900)
  expect(runs.filter(a => a.some(x => x.endsWith('/hub/hub.mjs'))).map(a => a[a.length - 1])).toEqual(['--stop', '--daemon'])
})

test('when no browser opens, /fog\'s row shows the address with its key to the person, and the model\'s text stays without it', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); hub(on, { opened: false })
  const drawn: string[] = []
  on('ui.render', ($$: Any, e: Any) => { drawn.push(e.props?.text ?? ''); return h(($$.ui.resolve(e) as Any).Box, {}) })
  await started($, on, clock)
  const r = await $.command.run({ command: 'fog' })
  expect(r.text).not.toContain(TOKEN)
  const ui = await $.ui.mount({ plugin: 'fogcast', surface: 'terminal', component: 'CommandOutput', props: { command: 'fog', args: '', text: r.text, isErrored: false } })
  await ui.unmount()
  expect(drawn.some(t => t.includes(`http://127.0.0.1:4317/#k=${TOKEN}`))).toBe(true)
})

test('a skill from everywhere joins コミュ only when called, and says where it is from', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const hb = hub(on)
  await started($, on, clock)
  const hello = hb.posts.find(p => p.path === '/api/mod/hello')!.body
  expect(hello.links.some((l: Any) => l.id === 'skill:dataviz')).toBe(false)
  expect(hello.loaded.skills.some((s: Any) => s.n === 'dataviz')).toBe(true)
  await $.turn.start({ text: 'グラフにして', turnId: 't9' })
  await $.tool.call({ tool: 'Skill', skill: 'dataviz' })
  await clock.advance(700)
  const ev = hb.events.find(e => e.k === 'tool' && e.link?.id === 'skill:dataviz')
  expect(ev.link).toEqual({ id: 'skill:dataviz', kind: 'skill', label: 'dataviz', src: '~/.claude', dt: 180 })
})

test('a message typed while a turn ran is read off its row as typed, and only the person\'s', () => {
  const wrap = (x: string) => `<system-reminder>\nThe user sent a new message while you were working:\n${x}\n\nThis is how Claude Code surfaces messages the user sends mid-turn.\n</system-reminder>`
  const row = (text: string, name = 'queued_command') => ({ name, content: [{ type: 'text', text }] })
  const typed = ['やっぱり棒グラフで', '色は\n\n青で']
  expect(midTurnText(row(wrap('やっぱり棒グラフで')), 'composer', typed)).toBe('やっぱり棒グラフで')
  expect(midTurnText(row(wrap('色は\n\n青で')), 'composer', typed)).toBe('色は\n\n青で')      // word for word, blank lines and all
  expect(typed).toEqual([])
  expect(midTurnText(row(wrap('見出しも')), undefined, [])).toBe('見出しも')                  // submitted before this terminal saw it
  expect(midTurnText(row('A background task finished.'), 'task-notification', [])).toBe('')
  expect(midTurnText(row(wrap('x'), 'nested_memory'), 'composer', [])).toBe('')
})

test('a skill only the person can run is listed with where it lives and no cost, and the project\'s own joins コミュ', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, [], {}, {
    commands: [{ name: 'api-conventions', description: 'API の決まり', source: 'user' }, { name: 'check-rules', description: '規約ファイルの整合性を確認する', source: 'user' }, { name: 'notes', description: 'メモ', source: 'user' }],
    dirs: { '.claude/skills': [{ name: 'api-conventions', kind: 'dir', size: 0, mtimeMs: 0 }, { name: 'check-rules', kind: 'dir', size: 0, mtimeMs: 0 }] },
  })
  const hb = hub(on)
  await started($, on, clock)
  const hello = hb.posts.find(p => p.path === '/api/mod/hello')!.body
  expect(hello.loaded.skills).toEqual([
    { n: 'api-conventions', src: '.claude', dt: 120 }, { n: 'dataviz', src: '~/.claude', dt: 180 },
    { n: 'check-rules', src: '.claude', dt: 0, manual: true }, { n: 'notes', src: '~/.claude', dt: 0, manual: true },
  ])
  expect(hello.links.map((l: Any) => l.id)).toEqual(['skill:api-conventions', 'skill:check-rules', 'agent:reviewer', 'mcp:github'])
})

// ---------------------------------------------------------------- questions, descriptions, suggestions

const QS = [
  { question: 'どちらで進めますか？', header: '方式', options: [{ label: 'A案', description: '速い' }, { label: 'B案', description: '安全' }], multiSelect: false },
  { question: 'どれを含めますか？', header: '範囲', options: [{ label: 'テスト', description: '' }, { label: '文書', description: '' }, { label: '型', description: '' }], multiSelect: true },
]

test('a question is drawn as asked, and only a full answer in its own terms is taken', () => {
  expect(questionsOf({ questions: QS })).toEqual([
    { q: 'どちらで進めますか？', h: '方式', multi: false, opts: [{ l: 'A案', d: '速い' }, { l: 'B案', d: '安全' }] },
    { q: 'どれを含めますか？', h: '範囲', multi: true, opts: [{ l: 'テスト', d: '' }, { l: '文書', d: '' }, { l: '型', d: '' }] },
  ])
  // labels as the terminal's dialog joins them; a pick is an index into the options
  expect(answersFor({ questions: QS }, [{ pick: [1] }, { pick: [2, 0], text: 'CI も' }])).toEqual({ 'どちらで進めますか？': 'B案', 'どれを含めますか？': 'テスト, 型, CI も' })
  expect(answersFor({ questions: QS }, [{ text: 'どちらでもない' }, { pick: [1] }])).toEqual({ 'どちらで進めますか？': 'どちらでもない', 'どれを含めますか？': '文書' })
  expect(answersFor({ questions: QS }, [{ pick: [1] }])).toBe(null)                       // every question
  expect(answersFor({ questions: QS }, [{ pick: [0, 1] }, { pick: [0] }])).toBe(null)     // one choice is one
  expect(answersFor({ questions: QS }, [{ pick: [7] }, { pick: [0] }])).toBe(null)        // one that is there
  expect(answersFor({ questions: QS }, [{ pick: [] }, { pick: [0] }])).toBe(null)         // an answer
  expect(keepText('一行目\r\n\n\n\n二行目  \n', 100)).toBe('一行目\n\n二行目')
})

test('a question answered on the screen reaches Claude in the tool\'s terms, and the terminal\'s dialog gives way', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, ['tool.call'])
  let dialogOpen = false
  on('tool.call', (_$: Any, e: Any) => e.tool === 'AskUserQuestion' ? new Promise(() => { dialogOpen = true }) : { result: {}, text: '' })
  const h = hub(on, { approvals: true })
  on('classic.PermissionRequest', () => ({}))
  await started($, on, clock)
  await $.turn.start({ text: '決めて', turnId: 'tq' })
  const call = $.tool.call({ tool: 'AskUserQuestion', questions: QS })
  await clock.settle()
  expect(dialogOpen).toBe(true)
  // the dialog's permission request is a question, not an approval: never offered to the screen as one
  const pr = await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: { questions: QS } })
  expect(pr.decision).toBe(undefined)
  expect(h.asked.length).toBe(0)
  await clock.advance(700)
  const q = h.events.find(e => e.k === 'question')
  expect(q.qs[1]).toEqual({ q: 'どれを含めますか？', h: '範囲', multi: true, opts: [{ l: 'テスト', d: '' }, { l: '文書', d: '' }, { l: '型', d: '' }] })
  expect(h.events.some(e => e.k === 'wait')).toBe(false)
  h.queue.push({ id: 'a1', type: 'answer', qid: q.id, answers: [{ pick: [1] }, { pick: [0, 2] }] })
  await clock.advance(700)
  const r = await call
  expect(r.result).toEqual({ questions: QS, answers: { 'どちらで進めますか？': 'B案', 'どれを含めますか？': 'テスト, 型' } })
  await clock.advance(700)
  expect(h.events.find(e => e.k === 'questionEnd')).toEqual(expect.objectContaining({ id: q.id, by: 'screen', answers: { 'どちらで進めますか？': 'B案', 'どれを含めますか？': 'テスト, 型' } }))
  expect(h.events.find(e => e.k === 'toolEnd' && e.id === q.id).err).toBe(false)
})

test('a question answered in the terminal closes on the screen too; an answer that does not fit is left alone', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, ['tool.call'])
  let answer: (v: Any) => void = () => {}
  on('tool.call', (_$: Any, e: Any) => e.tool === 'AskUserQuestion' ? new Promise(res => { answer = res }) : { result: {}, text: '' })
  const h = hub(on)
  await started($, on, clock)
  await $.turn.start({ text: '決めて', turnId: 'tq2' })
  const call = $.tool.call({ tool: 'AskUserQuestion', questions: QS })
  await clock.advance(700)
  const q = h.events.find(e => e.k === 'question')
  h.queue.push({ id: 'a2', type: 'answer', qid: q.id, answers: [{ pick: [9] }, { pick: [0] }] })    // no such option: ignored
  await clock.advance(700)
  const terminal = { questions: QS, answers: { 'どちらで進めますか？': 'A案', 'どれを含めますか？': '文書' }, annotations: {} }
  answer({ result: terminal, text: 'answered' })
  const r = await call
  expect(r.result).toEqual(terminal)
  await clock.advance(700)
  expect(h.events.find(e => e.k === 'questionEnd')).toEqual(expect.objectContaining({ id: q.id, by: 'terminal', answers: terminal.answers, err: false }))
})

test('a skill\'s and an agent\'s own descriptions ride with their cards; hints and the next-prompt suggestion reach the screen', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, [], {}, { commands: [{ name: 'api-conventions', description: 'API を設計するときに使う。\nURL とエラーの決まり。', source: 'user' }, { name: 'model', description: 'Set the model', source: 'builtin' }] })
  on('command.describe', (_$: Any, e: Any) => ({ description: e.description, argumentHint: e.argumentHint, isHidden: false }))
  on('agent.offer', () => ({ isOffered: true }))
  on('prompt.suggest', () => ({ isShown: true }))
  const h = hub(on)
  await $.command.describe({ command: 'model', description: 'Set the model', argumentHint: '[model]', isHidden: false, immediate: false, provider: { plugin: 'engine', tier: 'core' } })
  await started($, on, clock)
  const hello = h.posts.find(p => p.path === '/api/mod/hello')!.body
  expect(hello.links.find((l: Any) => l.id === 'skill:api-conventions').desc).toBe('API を設計するときに使う。\nURL とエラーの決まり。')
  expect(hello.loaded.skills[0]).toEqual({ n: 'api-conventions', src: '.claude', dt: 120 })      // the list for the skills tab stays lean
  expect(hello.commands.find((c: Any) => c.name === 'model').hint).toBe('[model]')
  await $.turn.start({ text: '見て', turnId: 'td' })
  await $.agent.offer({ agent: 'reviewer', description: '変更を確かめるエージェント', source: 'projectSettings', provider: { plugin: 'user', tier: 'user' } })
  await $.agent.offer({ agent: 'Explore', description: 'Fast read-only search agent', source: 'built-in', provider: { plugin: 'engine', tier: 'core' } })
  await $.agent.offer({ agent: 'reviewer', description: '変更を確かめるエージェント', source: 'projectSettings', provider: { plugin: 'user', tier: 'user' } })
  await $.tool.call({ tool: 'Agent', subagent_type: 'reviewer', description: '確認', prompt: 'x' })
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'td', reason: 'answer', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: 'm' } })
  await $.prompt.suggest({ text: 'テストを実行して' })
  await clock.advance(700)
  expect(h.events.filter(e => e.k === 'desc')).toEqual([expect.objectContaining({ id: 'agent:reviewer', desc: '変更を確かめるエージェント' })])   // once, and not for the built-in
  expect(h.events.find(e => e.k === 'tool' && e.link?.id === 'agent:reviewer').link.desc).toBe('変更を確かめるエージェント')
  expect(h.events.filter(e => e.k === 'suggest').map(e => e.text)).toEqual(['テストを実行して'])
  await $.turn.start({ text: 'テストを実行して', turnId: 'te' })
  await clock.advance(700)
  expect(h.events.filter(e => e.k === 'suggest').map(e => e.text)).toEqual(['テストを実行して', ''])
})

test('a prompt from the screen carries its id into the turn it starts', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  on('prompt.submit', (_$: Any, e: Any) => ({ text: e.text }))
  await started($, on, clock)
  h.queue.push({ id: 'cid-7', type: 'prompt', text: 'READMEを直して' })
  await clock.advance(700)
  await $.turn.start({ text: 'READMEを直して', turnId: 'tr' })
  await clock.advance(700)
  expect(h.events.find(e => e.k === 'turn')).toEqual(expect.objectContaining({ text: 'READMEを直して', via: 'screen', cid: 'cid-7' }))
})
