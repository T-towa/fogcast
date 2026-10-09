import { test, expect, mock } from 'claude-code/testing'
import { linkFor, summarize, outline, fileChange, todosOf, statusLine, textOf, rel, older, midTurnText, questionsOf, answersFor, keepText, commandRow, effortLevels, modelKey, settingOf, effortSet } from './shape'

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
      const v = opts.version ? opts.version() : '0.5.6'
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

// a project for @: the terminal's folder is /home/t/dev/shop; a link inside it leads out, a file beside it is outside
const ROOT = '/home/t/dev/shop'
const FILES: Record<string, string> = { 'src/a.ts': 'const a = 1\nexport default a\n', 'notes/my file.md': '# メモ\n', 'logo.png': 'PNG' }
const norm = (p: string) => { const out: string[] = []; for (const s of p.split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s) } return '/' + out.join('/') }
function project(on: Any) {
  const rel = (p: string) => { const a = norm(String(p)); return a === ROOT ? '.' : a.startsWith(ROOT + '/') ? a.slice(ROOT.length + 1) : a }
  on('fs.read', (_$: Any, e: Any) => {
    const p = String(e.path)
    if (p.endsWith('/token')) return { value: TOKEN }
    const r = rel(p); if (r in FILES) return { value: FILES[r] }
    throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' })
  })
  on('fs.stat', (_$: Any, e: Any) => {
    const r = rel(e.path)
    const isDir = r === '.' || r === 'src' || r === 'notes', isFile = r in FILES || r === 'out-link' || r === '/home/t/dev/secret.txt'
    if (!isDir && !isFile) throw Object.assign(new Error(`ENOENT: ${r}`), { code: 'ENOENT' })
    const realPath = r === 'out-link' ? '/home/t/secret.txt' : r.startsWith('/') ? r : r === '.' ? ROOT : `${ROOT}/${r}`
    return { value: { kind: isDir ? 'dir' : 'file', size: isFile ? (FILES[r] ?? 'x').length : 0, mtimeMs: 1, isLink: r === 'out-link', realPath } }
  })
  on('fs.list', (_$: Any, e: Any) => ({ value: rel(e.path) === 'src' ? [{ name: 'a.ts', kind: 'file', size: 30, mtimeMs: 1, isLink: false }, { name: 'lib', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] : [] }))
}

test('a prompt from the screen that names files with @ brings them in first, as the terminal would; only what lies in its folder is read', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, ['fs.read', 'fs.list']); project(on); const h = hub(on)
  const order: string[] = [], appended: Any[] = []
  on('session.append', async (_$: Any, e: Any, next: Any) => { if (e.door === 'note') { appended.push(e); order.push('row') } return next(e) })
  on('prompt.submit', (_$: Any, e: Any) => { order.push('prompt'); return { text: e.text } })
  await started($, on, clock)
  const text = '@src/a.tsと @"notes/my file.md" と @src/ を見て。@../secret.txt @out-link @/etc/passwd @logo.png @nothere.ts も'
  h.queue.push({ id: 'p1', type: 'prompt', text })
  await clock.advance(700); await clock.settle()
  expect(order).toEqual(['row', 'prompt'])
  const row = appended[0].message.content[0].text as string
  expect(row).toContain('<file path="src/a.ts" lines="2">\n     1\tconst a = 1\n     2\texport default a\n</file>')
  expect(row).toContain('<file path="notes/my file.md" lines="1">')
  expect(row).toContain('<directory path="src/">\nlib/\na.ts\n</directory>')
  expect(row).not.toContain('secret')
  await $.turn.start({ text, turnId: 'tp' })
  await clock.advance(700)
  const t = h.events.find(e => e.k === 'turn')
  expect([t.via, t.cid]).toEqual(['screen', 'p1'])
  expect(t.files).toEqual([
    { p: 'src/a.ts', kind: 'file', lines: 2, shown: 2 }, { p: 'notes/my file.md', kind: 'file', lines: 1, shown: 1 }, { p: 'src/', kind: 'dir', lines: 2 },
    { p: '../secret.txt', err: 'outside' }, { p: 'out-link', err: 'outside' }, { p: '/etc/passwd', err: 'outside' }, { p: 'logo.png', kind: 'file', err: 'binary' }, { p: 'nothere.ts', err: 'missing' },
  ])
})

test('a prompt with @ sent while a turn runs waits for it, its files going in right before it', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, ['fs.read', 'fs.list']); project(on); const h = hub(on)
  const order: string[] = []
  on('session.append', async (_$: Any, e: Any, next: Any) => { if (e.door === 'note') order.push('row') ; return next(e) })
  on('prompt.submit', (_$: Any, e: Any) => { order.push(`prompt:${e.text}`); return { text: e.text } })
  await started($, on, clock)
  await $.turn.start({ text: '作業中', turnId: 'tw' })
  h.queue.push({ id: 'p2', type: 'prompt', text: '@src/a.ts を直して' }, { id: 'p3', type: 'prompt', text: 'ふつうの依頼' })
  await clock.advance(700); await clock.settle()
  expect(order).toEqual(['prompt:ふつうの依頼'])               // one without @ is queued by Claude Code at once, as before
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'tw', reason: 'answer', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: 'm' } })
  await clock.advance(700); await clock.settle()
  expect(order).toEqual(['prompt:ふつうの依頼', 'row', 'prompt:@src/a.ts を直して'])
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
    if (e.argv.includes('--daemon')) version = '0.5.6'
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

// ---------------------------------------------------------------- commands: resume, model, effort

test('a command\'s printed line is read off its rows; the effort levels off /effort\'s hint', () => {
  expect(commandRow('<command-name>/model</command-name>\n            <command-message>model</command-message>\n            <command-args>sonnet</command-args>')).toEqual({ name: 'model' })
  expect(commandRow([{ type: 'text', text: '<local-command-stdout>Set model to \u001b[1mSonnet 5.5\u001b[22m and saved\r\nas your default</local-command-stdout>' }])).toEqual({ out: 'Set model to Sonnet 5.5 and saved\nas your default' })
  expect(commandRow('<local-command-stdout></local-command-stdout>')).toEqual({ out: '' })
  expect(commandRow('<local-command-caveat>The command below was run directly in Claude Code</local-command-caveat>')).toEqual({})
  expect(effortLevels('[low|medium|high|xhigh|max|auto|ultracode [on|off]]')).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'auto'])
  expect(effortLevels(undefined)).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  expect(modelKey('claude-opus-5-5[1m]')).toBe('claude-opus-5-5')
  // the /config Model row holds a label before anything is set, and can hold a model id: the picker needs the choice
  const opts = ['default', 'sonnet', 'opus', 'haiku', 'best', 'sonnet[1m]', 'opus[1m]', 'opusplan']
  expect(settingOf('Default (recommended)', opts)).toBe('default')
  expect(settingOf('sonnet', opts)).toBe('sonnet')
  expect(settingOf('claude-opus-5-5', opts)).toBe('opus')
  expect(settingOf('claude-opus-5-5[1m]', opts)).toBe('opus[1m]')
  expect(settingOf('opusplan', opts)).toBe('opusplan')
  expect(settingOf('', opts)).toBe('')
  expect(effortSet('Set effort level to high (saved as your default for new sessions): Comprehensive …')).toBe('high')
  expect(effortSet('Effort level set to auto')).toBe('auto')
  expect(effortSet('Cancelled')).toBe('')
})

test('a /resume in the terminal swaps the conversation: the channel goes on and is told which one it is on now', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  on('classic.SessionStart', () => ({}))
  const DIR = '/home/t/.claude/projects/-home-t-dev-shop'
  await $.classic.SessionStart({ source: 'startup', session_id: 'sess-1', transcript_path: `${DIR}/sess-1.jsonl`, model: 'claude-opus-5-5' })
  await started($, on, clock)
  const hello = h.posts.find(p => p.path === '/api/mod/hello')!.body
  expect(hello.tp).toBe(`${DIR}/sess-1.jsonl`)
  expect(hello.tdir).toBe(DIR)                        // the project's conversations, for the screen's resume list
  await $.session.end({ reason: 'resume', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'sess-2', session_title: 'bananas-talk', transcript_path: `${DIR}/sess-2.jsonl`, model: 'claude-opus-5-5' })
  await clock.advance(700)
  expect(h.events.some(e => e.k === 'end')).toBe(false)
  expect(h.events.find(e => e.k === 'resumed')).toEqual(expect.objectContaining({ from: 'sess-1', sid: 'sess-2', title: 'bananas-talk', tp: `${DIR}/sess-2.jsonl`, source: 'resume' }))
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sess-2', resume: { id: 'sess-2' } })
  expect(h.events.filter(e => e.k === 'end')).toEqual([expect.objectContaining({ reason: 'prompt_input_exit', resume: 'sess-2' })])
})

test('the screen\'s resume, effort and model reach the terminal as its own; while a turn runs they wait for it to end', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  const ran: Any[] = [], set: Any[] = []
  on('command.run', (_$: Any, e: Any) => { ran.push([e.command, e.args]); return {} })
  on('config.set', (_$: Any, e: Any) => { set.push([e.key, e.value]); return { value: e.value } })
  await started($, on, clock)
  h.queue.push({ id: 'r1', type: 'resume', sid: '26524db9-d8aa-466f-a4d6-484562d1ea8e' }, { id: 'e1', type: 'effort', value: 'high' })
  await clock.advance(700); await clock.settle()
  expect(ran).toEqual([['resume', '26524db9-d8aa-466f-a4d6-484562d1ea8e'], ['effort', 'high']])
  await $.turn.start({ text: 'まとめて', turnId: 'tm' })
  h.queue.push({ id: 'm1', type: 'model', value: 'sonnet' }, { id: 'e2', type: 'effort', value: 'low' }, { id: 'r2', type: 'resume', sid: 'a4d1b2c3-0000-4000-8000-000000000001' })
  await clock.advance(700); await clock.settle()
  expect(set).toEqual([])                                   // mid-turn nothing changes under the running turn
  expect(ran.length).toBe(2)
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'tm', reason: 'answer', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: 'm' } })
  await clock.advance(700); await clock.settle()
  expect(set).toEqual([['model', 'sonnet']])                // the /config Model row: no "switch model?" question in the terminal
  expect(ran.slice(2)).toEqual([['effort', 'low'], ['resume', 'a4d1b2c3-0000-4000-8000-000000000001']])
})

test('a resume that goes through is told by the conversation it brings back; one that does not, by its line', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  on('classic.SessionStart', () => ({}))
  const DIR = '/home/t/.claude/projects/-home-t-dev-shop'
  on('command.run', async (_$: Any, e: Any) => {
    if (e.args === 'sess-gone') return { text: 'Session sess-gone was not found.' }
    await $.session.end({ reason: 'resume', sessionId: 'sess-1', resume: { id: 'sess-1' } })
    await $.classic.SessionStart({ source: 'resume', session_id: 'sess-2', session_title: 'bananas-talk', transcript_path: `${DIR}/sess-2.jsonl`, model: 'claude-opus-5-5' })
    return {}
  })
  await started($, on, clock)
  await $.command.run({ command: 'resume', args: 'sess-2' })
  await clock.advance(1000)
  await $.command.run({ command: 'resume', args: 'sess-gone' })
  await clock.advance(1500)
  expect(h.events.filter(e => e.k === 'resumed').map(e => e.sid)).toEqual(['sess-2'])
  expect(h.events.filter(e => e.k === 'cmd').map(e => [e.name, e.args, e.text])).toEqual([['resume', 'sess-gone', 'Session sess-gone was not found.']])
})

test('each command run gets one row: with the line it printed, from the screen or the terminal; one that did something else is told by that', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  on('classic.PostModelSwitch', () => ({}))
  const row =(text: string) => $.session.append({ door: 'command', uuid: 'u', origin: { kind: 'composer' }, message: { type: 'user', role: 'user', content: [{ type: 'text', text }] } })
  on('command.run', async (_$: Any, e: Any) => {
    if (e.command === 'rename') return { text: `Session renamed to: ${e.args}` }
    if (e.command === 'model') await $.classic.PostModelSwitch({ from_model: 'claude-opus-5-5', to_model: 'claude-sonnet-5-5', requested_model: 'sonnet', source: 'command', context_tokens: 0, cache_warm: true })
    return {}
  })
  await started($, on, clock)
  // from the screen: its line comes as a row of the conversation, and rides in the command's row
  h.queue.push({ id: 'e1', type: 'command', name: 'effort', args: 'high' })
  await clock.advance(700); await clock.settle()
  await row('<command-name>/effort</command-name>\n<command-args>high</command-args>')
  await row('<local-command-stdout>Set effort level to high (saved as your default for new sessions)</local-command-stdout>')
  await clock.advance(1500)
  // typed: one that answers with text; one that switches the model; a skill that starts a turn; a panel whose line comes late
  await $.command.run({ command: 'rename', args: 'shop-fix' })
  await row('<command-name>/rename</command-name>'); await row('<local-command-stdout>Session renamed to: shop-fix</local-command-stdout>')
  await $.command.run({ command: 'model', args: 'sonnet' })
  await row('<command-name>/model</command-name>'); await row('<local-command-stdout>Set model to Sonnet 5.5</local-command-stdout>')
  await $.command.run({ command: 'init', args: '' })
  await $.turn.start({ text: 'Please analyze this codebase and create a CLAUDE.md file', turnId: 'ti' })
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'ti', reason: 'answer', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: 'm' } })
  await $.command.run({ command: 'usage', args: '' })
  await clock.advance(1500)
  await row('<command-name>/usage</command-name>'); await row('<local-command-stdout>Usage dialog dismissed</local-command-stdout>')
  await clock.advance(1500)
  const cmds = h.events.filter(e => e.k === 'cmd')
  expect(cmds.map(e => [e.name, e.args, e.text, e.via])).toEqual([
    ['effort', 'high', 'Set effort level to high (saved as your default for new sessions)', 'screen'],
    ['rename', 'shop-fix', 'Session renamed to: shop-fix', undefined],
    ['usage', '', '', undefined],
  ])
  expect(h.events.filter(e => e.k === 'cmdOut').map(e => [e.name, e.text, e.run === cmds[2].run])).toEqual([['usage', 'Usage dialog dismissed', true]])
  expect(h.events.filter(e => e.k === 'model').map(e => e.to)).toEqual(['claude-sonnet-5-5'])
  expect(h.events.find(e => e.k === 'turn').text).toBe('/init')
  expect(h.events.filter(e => e.k === 'info' && e.effort).map(e => e.effort)).toEqual(['high'])
})

test('a compaction asked for on the screen is told once it is done (its own hook does not see it), or why it did not happen', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  let veto = ''
  on('session.messages', () => ({ value: [{ role: 'user', text: '依頼', toolUses: [] }, { role: 'assistant', text: '答え', toolUses: [] }] }))
  on('session.compact', () => (veto ? { skip: veto } : { messages: [{ role: 'user', text: '要約', toolUses: [] }], tokensBefore: 50000, tokensAfter: 4000 }))
  await started($, on, clock)
  h.queue.push({ id: 'k1', type: 'compact' })
  await clock.advance(700); await clock.settle(); await clock.advance(700)
  expect(h.events.filter(e => e.k === 'compact').map(e => [e.trigger, e.via])).toEqual([['manual', 'screen']])
  veto = 'a plugin keeps this conversation whole'
  h.queue.push({ id: 'k2', type: 'compact' })
  await clock.advance(2100); await clock.settle(); await clock.advance(2100)
  expect(h.events.filter(e => e.k === 'compact').length).toBe(1)
  expect(h.events.find(e => e.k === 'did')).toEqual(expect.objectContaining({ cid: 'k2', what: 'compact', ok: false, error: 'a plugin keeps this conversation whole' }))
})

test('a command that starts no turn does not lend its name to the prompt typed next', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  on('command.run', () => ({}))                                  // its line comes as a row of the conversation, not as text
  await started($, on, clock)
  h.queue.push({ id: 'e1', type: 'effort', value: 'auto' })
  await clock.advance(700); await clock.settle(); await clock.advance(1500)
  await $.turn.start({ text: 'READMEを直して', turnId: 'tn' })
  await clock.advance(700)
  const t = h.events.find(e => e.k === 'turn')
  expect([t.text, t.via]).toEqual(['READMEを直して', undefined])
})

test('a model switch is told in the conversation, with the effort the settings keep for the new model; a resume\'s restore is not', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  on('classic.PostModelSwitch', () => ({}))
  on('settings.read', () => ({ value: { modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'high' } } } }))
  await started($, on, clock)
  await $.classic.PostModelSwitch({ from_model: 'claude-opus-5-5', to_model: 'claude-sonnet-5-5', requested_model: 'sonnet', source: 'command', context_tokens: 0, cache_warm: true })
  await $.classic.PostModelSwitch({ from_model: 'claude-sonnet-5-5', to_model: 'claude-haiku-5-5', requested_model: null, source: 'resume', context_tokens: 0, cache_warm: false })
  await clock.advance(700)
  expect(h.events.filter(e => e.k === 'model')).toEqual([expect.objectContaining({ from: 'claude-opus-5-5', to: 'claude-sonnet-5-5', src: 'command' })])
  expect(h.events.filter(e => e.k === 'info' && e.effort).map(e => e.effort)).toEqual(['high'])
  expect(h.events.filter(e => e.k === 'info' && e.model).map(e => e.model)).toEqual(['claude-haiku-5-5'])
})

test('the picker marks the model /config holds, read back after every change: also a pick of the model in use, and one made in the terminal', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  let setting = 'Default (recommended)'
  const opts = ['default', 'sonnet', 'opus', 'haiku']
  on('config.list', () => ({ value: [{ key: 'model', label: 'Model', kind: 'choice', value: setting, options: opts, provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] }))
  on('config.set', (_$: Any, e: Any) => { setting = e.value; return { value: e.value } })
  on('classic.PostModelSwitch', () => ({}))
  on('command.run', () => ({}))
  await started($, on, clock)
  expect(h.posts.find(p => p.path === '/api/mod/hello')!.body.models).toEqual({ options: opts, value: 'default' })   // the label stands for its choice
  // the screen picks the model already in use: no switch follows, the setting changes all the same
  h.queue.push({ id: 'm1', type: 'model', value: 'opus' })
  await clock.advance(700); await clock.settle(); await clock.advance(700)
  expect(h.events.filter(e => e.k === 'models').map(e => e.value)).toEqual(['opus'])
  // a moment later the terminal's /model switches: told as the terminal's, and the mark follows it
  await clock.advance(2000)
  await $.command.run({ command: 'model', args: 'haiku' })
  setting = 'haiku'
  await $.classic.PostModelSwitch({ from_model: 'claude-opus-5-5', to_model: 'claude-haiku-5-5', requested_model: 'haiku', source: 'command', context_tokens: 0, cache_warm: true })
  await clock.advance(1500)
  expect(h.events.filter(e => e.k === 'model').map(e => [e.to, e.src])).toEqual([['claude-haiku-5-5', 'command']])
  expect(h.events.filter(e => e.k === 'models').map(e => e.value)).toEqual(['opus', 'haiku'])
  // changed in the terminal's /config: the mark follows that too
  setting = 'sonnet'
  await $.config.set({ key: 'model', value: 'sonnet' })
  await clock.advance(1500)
  expect(h.events.filter(e => e.k === 'models').map(e => e.value)).toEqual(['opus', 'haiku', 'sonnet'])
})

test('effort: the setting stands as set (auto too); what a request really went with is kept beside it', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on); const h = hub(on)
  on('command.run', () => ({ text: 'Effort level set to auto' }))
  await started($, on, clock)
  const step = async (effort: string, turnId: string) => { const g = $.turn.step({ effort, model: 'claude-opus-5-5', turnId }); if (g && typeof g[Symbol.asyncIterator] === 'function') { for await (const _ of g) { /* drained */ } } else await g }
  await step('medium', 't0').catch(() => {})
  await clock.advance(700)
  expect(h.events.filter(e => e.k === 'info' && (e.effort || e.effortUsed)).map(e => [e.effort, e.effortUsed])).toEqual([[undefined, 'medium'], ['medium', undefined]])
  await $.command.run({ command: 'effort', args: 'auto' })
  await step('high', 't1').catch(() => {})
  await clock.advance(1500)
  const told = h.events.filter(e => e.k === 'info' && (e.effort || e.effortUsed)).map(e => [e.effort, e.effortUsed])
  expect(told.slice(2)).toEqual([['auto', undefined], [undefined, 'high']])      // auto stays the setting; it came to high
})

test('the pickers\' choices ride with the hello; a built-in that is a skill is marked, and one found out later is told', async ($: Any, on: Any) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  engine(on, [], {}, { commands: [{ name: 'effort', description: 'Set effort level', source: 'builtin' }, { name: 'dataviz', description: 'charts', source: 'builtin' }, { name: 'doctor', description: 'Health-check', source: 'builtin' }] })
  on('command.describe', (_$: Any, e: Any) => ({ description: e.description, argumentHint: e.argumentHint, isHidden: false }))
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: 'dark', options: ['dark', 'light'], provider: { plugin: 'engine', tier: 'core' }, isLocked: false },
    { key: 'model', label: 'Model', kind: 'choice', value: 'opus', options: ['default', 'sonnet', 'opus', 'opus[1m]'], provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] }))
  on('settings.read', () => ({ value: { modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' } } } }))
  on('skill.prompt', (_$: Any, e: Any) => ({ text: e.text }))
  const h = hub(on)
  await $.command.describe({ command: 'effort', description: 'Set effort level', argumentHint: '[low|medium|high|xhigh|max|auto|ultracode [on|off]]', isHidden: false, immediate: true, provider: { plugin: 'engine', tier: 'core' } })
  await started($, on, clock)
  const hello = h.posts.find(p => p.path === '/api/mod/hello')!.body
  expect(hello.models).toEqual({ options: ['default', 'sonnet', 'opus', 'opus[1m]'], value: 'opus' })
  expect(hello.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'auto'])
  expect(hello.effort).toBe('xhigh')                              // what /effort saved for this model, until a request says
  expect(hello.commands.find((c: Any) => c.name === 'dataviz').skill).toBe(true)
  expect(hello.commands.find((c: Any) => c.name === 'doctor').skill).toBe(undefined)
  await $.skill.prompt({ skill: 'doctor', text: 'check the setup' })
  await $.skill.prompt({ skill: 'doctor', text: 'again' })
  await clock.advance(700)
  expect(h.events.filter(e => e.k === 'skillCmd').map(e => e.name)).toEqual(['doctor'])
})
