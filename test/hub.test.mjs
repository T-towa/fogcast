// Runs the hub on a spare port with a throwaway home and talks to it the way the
// mod and the screen do.  node --test test/
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const HUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'hub', 'hub.mjs')
const PORT = 47000 + Math.floor(Math.random() * 1000)
const HOME = mkdtempSync(join(tmpdir(), 'fogcast-test-'))
let hub, TOKEN

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body)
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path, headers: { 'x-fogcast-token': TOKEN, ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, res => {
      let text = ''; res.on('data', d => { text += d }); res.on('end', () => { let json = null; try { json = JSON.parse(text) } catch {} resolve({ status: res.statusCode, json, text, headers: res.headers }) })
    })
    r.on('error', reject); if (data) r.write(data); r.end()
  })
}
// the screen's stream: collects messages until stopped
function stream(client) {
  const msgs = []; let buf = ''
  const r = http.request({ host: '127.0.0.1', port: PORT, path: '/api/ui/stream', headers: { 'x-fogcast-token': TOKEN, 'x-fogcast-client': client } }, res => {
    res.setEncoding('utf8')
    res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (line.startsWith('data: ')) msgs.push(JSON.parse(line.slice(6))) } })
  })
  r.end()
  return { msgs, stop: () => r.destroy(), wait: async (pred, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = msgs.find(pred); if (m) return m; await new Promise(r => setTimeout(r, 20)) } throw new Error('no such message') } }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

before(async () => {
  hub = spawn(process.execPath, [HUB], { env: { ...process.env, FOGCAST_PORT: String(PORT), FOGCAST_HOME: HOME }, stdio: ['ignore', 'pipe', 'pipe'] })
  for (let i = 0; i < 100; i++) {
    try { const r = await new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: '/api/health' }, x => { x.resume(); res(x.statusCode) }).on('error', rej)); if (r === 200) break } catch {}
    await sleep(50)
  }
  TOKEN = readFileSync(join(HOME, 'token'), 'utf8').trim()
})
after(async () => { const gone = new Promise(r => hub.once('exit', r)); hub.kill(); await gone; rmSync(HOME, { recursive: true, force: true }) })     // it saves as it stops

test('refuses other hosts, other origins and a missing token', async () => {
  assert.equal((await req('GET', '/api/health', undefined, { host: 'evil.example:' + PORT })).status, 403)
  assert.equal((await req('POST', '/api/mod/sync', { chan: 'x' }, { origin: 'https://evil.example' })).status, 403)
  assert.equal((await req('POST', '/api/mod/sync', { chan: 'x' }, { 'x-fogcast-token': 'nope' })).status, 401)
  const page = await req('GET', '/')
  assert.equal(page.status, 200)
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/)
})

test('a terminal says hello, reports a turn, and the screen sees it', async () => {
  const s = stream('screen-a')
  await s.wait(m => m.type === 'hello')
  const hello = await req('POST', '/api/mod/hello', { chan: 'chan-one', sid: 'sess-1', cwd: '/home/me/dev/shop-api', branch: 'main', model: 'Opus', commands: [{ name: 'compact', description: 'x', source: 'builtin' }] })
  assert.equal(hello.json.ok, true); assert.equal(hello.json.num, 1); assert.equal(hello.json.name, 'shop-api')
  const t = Date.now()
  const sync = await req('POST', '/api/mod/sync', { chan: 'chan-one', events: [
    { k: 'measure', t, ctx: { tokens: 50000, window: 200000, percent: 25 }, limits: [{ kind: 'five_hour', pc: 40, resetsAt: new Date(t + 3600e3).toISOString() }, { kind: 'seven_day', pc: 60, resetsAt: new Date(t + 3 * 86400e3).toISOString() }], usd: 1.25 },
    { k: 'turn', t, id: 'turn-1', text: 'テストを直して' },
    { k: 'tool', t, id: 'tu1', name: 'Bash', input: 'npm test', link: { id: 'Bash', kind: 'tool', label: 'Bash', src: '組み込み' } },
    { k: 'wait', t, id: 'tu1', name: 'Bash', input: 'npm test' },
  ] })
  assert.equal(sync.json.ok, true)
  const ch = await s.wait(m => m.type === 'chan' && m.chan.status === 'wait')
  assert.equal(ch.chan.num, 1)
  assert.match(ch.chan.now, /承認待ち/)
  await req('POST', '/api/mod/sync', { chan: 'chan-one', events: [
    { k: 'toolEnd', t: t + 900, id: 'tu1', err: false, out: '22 passed' },
    { k: 'say', t: t + 1000, text: '直しました。' },
    { k: 'measure', t: t + 1000, ctx: { tokens: 62000, window: 200000, percent: 31 }, limits: [], usd: 1.4 },
    { k: 'turnEnd', t: t + 1100, id: 'turn-1', ms: 1100, usage: { in: 1000, out: 300, cw: 200, cr: 40000 } },
  ] })
  const idle = await s.wait(m => m.type === 'chan' && m.chan.status === 'idle' && m.chan.perTurn.length === 1)
  assert.deepEqual(idle.chan.perTurn, [12000])
  assert.equal(idle.chan.tok, 1500)
  const links = await s.wait(m => m.type === 'links' && m.links.some(l => l.id === 'Bash' && l.uses === 1))
  assert.ok(links)
  const evs = s.msgs.filter(m => m.type === 'ev').map(m => m.ev.k)
  assert.deepEqual(evs, ['turn', 'tool', 'wait', 'toolEnd', 'say', 'turnEnd'])
  s.stop()
})

test('the screen sends a prompt; the terminal picks it up on its next sync', async () => {
  const r = await req('POST', '/api/ui/send', { chan: 'chan-one', text: '続けて' })
  assert.equal(r.json.ok, true)
  const sync = await req('POST', '/api/mod/sync', { chan: 'chan-one', events: [] })
  assert.equal(sync.json.commands.length, 1)
  assert.equal(sync.json.commands[0].type, 'prompt'); assert.equal(sync.json.commands[0].text, '続けて')
  const again = await req('POST', '/api/mod/sync', { chan: 'chan-one', events: [] })
  assert.equal(again.json.commands.length, 0)
})

test('approvals stay with the terminal until a screen pairs with the code shown there', async () => {
  // off: the terminal keeps its own dialog
  assert.equal((await req('POST', '/api/mod/ask', { chan: 'chan-one', id: 'tu2', tool: 'Bash', input: 'rm -rf build' })).json.mode, 'terminal')
  // a terminal on this version says so in its hello
  assert.equal((await req('POST', '/api/mod/hello', { chan: 'chan-mod', mod: '0.1.1', sid: 'sess-m', cwd: '/home/me/dev/docs' })).json.ok, true)
  const s = stream('screen-b')
  await s.wait(m => m.type === 'hello')
  const on = await req('POST', '/api/ui/approvals', { on: true }, { 'x-fogcast-client': 'screen-b' })
  assert.equal(on.json.pairing, true)
  assert.deepEqual(on.json.terminals.map(t => t.num).sort(), [1, 2])
  const ap = await s.wait(m => m.type === 'ap' && m.approvals.pairing)
  assert.ok(ap.approvals.exp > Date.now() + 250e3)
  assert.equal(JSON.stringify(ap).match(/\d{4}-\d{4}/), null)          // the screen never sees the code
  // a terminal of this version is handed the code as state, every sync, to frame above its prompt
  const sync = await req('POST', '/api/mod/sync', { chan: 'chan-mod', events: [] })
  const code = sync.json.pair.code
  assert.match(code, /^\d{4}-\d{4}$/)
  assert.equal(sync.json.commands.some(c => c.type === 'toast'), false)
  assert.equal((await req('POST', '/api/mod/sync', { chan: 'chan-mod', events: [] })).json.pair.code, code)
  // a terminal still on 0.1.0 only knows the passing notice
  const legacy = await req('POST', '/api/mod/sync', { chan: 'chan-one', events: [] })
  assert.ok(legacy.json.commands.find(c => c.type === 'toast').text.includes(code))
  assert.equal((await req('POST', '/api/ui/pair', { code: '0000-0000' }, { 'x-fogcast-client': 'screen-b' })).status, 403)
  assert.equal((await req('POST', '/api/ui/pair', { code }, { 'x-fogcast-client': 'screen-b' })).json.ok, true)
  // used: the terminals drop it, and say the browser is connected
  const after = await req('POST', '/api/mod/sync', { chan: 'chan-mod', events: [] })
  assert.equal(after.json.pair, null)
  assert.match(after.json.commands.find(c => c.type === 'toast').text, /ブラウザとつながりました/)
  assert.equal((await s.wait(m => m.type === 'ap' && m.approvals.pairedHere)).approvals.end, 'paired')
  // a screen that never paired cannot answer
  const ask = await req('POST', '/api/mod/ask', { chan: 'chan-one', id: 'tu3', tool: 'Bash', input: 'git push' })
  assert.equal(ask.json.mode, 'screen')
  await s.wait(m => m.type === 'ask' && m.ask.id === 'tu3')
  assert.equal((await req('POST', '/api/ui/answer', { id: 'tu3', decision: 'allow' }, { 'x-fogcast-client': 'someone-else' })).status, 403)
  const waiting = req('POST', '/api/mod/ask/wait', { id: 'tu3' })
  await sleep(100)
  assert.equal((await req('POST', '/api/ui/answer', { id: 'tu3', decision: 'allow' }, { 'x-fogcast-client': 'screen-b' })).json.ok, true)
  assert.equal((await waiting).json.decision, 'allow')
  // the terminal can take it back from its band
  await req('POST', '/api/mod/ask', { chan: 'chan-one', id: 'tu4', tool: 'Bash', input: 'make deploy' })
  const w2 = req('POST', '/api/mod/ask/wait', { id: 'tu4' })
  await sleep(50)
  await req('POST', '/api/mod/ask/answer', { id: 'tu4', decision: 'terminal' })
  assert.equal((await w2).json.decision, 'terminal')
  // turned off: back to the terminal
  await req('POST', '/api/ui/approvals', { on: false }, { 'x-fogcast-client': 'screen-b' })
  assert.equal((await req('POST', '/api/mod/ask', { chan: 'chan-one', id: 'tu5', tool: 'Bash', input: 'ls' })).json.mode, 'terminal')
  s.stop()
})

test('a code can be taken back from the terminal or the screen, and gives out after five wrong tries', async () => {
  const s = stream('screen-e')
  await s.wait(m => m.type === 'hello')
  const issue = async () => { await req('POST', '/api/ui/approvals', { on: true }, { 'x-fogcast-client': 'screen-e' }); return (await req('POST', '/api/mod/sync', { chan: 'chan-mod', events: [] })).json.pair.code }
  // from the terminal's band: only the code it shows
  let code = await issue()
  await req('POST', '/api/mod/pair/cancel', { chan: 'chan-mod', code: '1111-1111' })
  assert.equal((await req('POST', '/api/mod/sync', { chan: 'chan-mod', events: [] })).json.pair.code, code)
  await req('POST', '/api/mod/pair/cancel', { chan: 'chan-mod', code })
  assert.equal((await req('POST', '/api/mod/sync', { chan: 'chan-mod', events: [] })).json.pair, null)
  assert.equal((await s.wait(m => m.type === 'ap' && m.approvals.end === 'cancel-terminal')).approvals.pairing, false)
  assert.equal((await req('POST', '/api/ui/pair', { code }, { 'x-fogcast-client': 'screen-e' })).json.error, 'expired')
  // from the screen
  code = await issue()
  await req('POST', '/api/ui/pair/cancel', {}, { 'x-fogcast-client': 'screen-e' })
  assert.equal((await req('POST', '/api/mod/sync', { chan: 'chan-mod', events: [] })).json.pair, null)
  // five wrong tries
  code = await issue()
  for (let i = 0; i < 5; i++) assert.equal((await req('POST', '/api/ui/pair', { code: '9999-999' + i }, { 'x-fogcast-client': 'screen-e' })).status, 403)
  await s.wait(m => m.type === 'ap' && m.approvals.end === 'tries')
  assert.equal((await req('POST', '/api/ui/pair', { code }, { 'x-fogcast-client': 'screen-e' })).json.error, 'expired')
  s.stop()
})

test('the guide is served beside the screen, and the versions agree', async () => {
  const g = await req('GET', '/guide')
  assert.equal(g.status, 200)
  assert.match(g.text, /<title>Fogcast 取扱説明書<\/title>/)
  assert.match(g.text, /claude plugin install fogcast@fogcast/)
  assert.match(g.headers['content-security-policy'], /default-src 'none'/)
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const plugin = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version
  const mod = /export const VERSION = '([^']+)'/.exec(readFileSync(join(root, 'hooks', 'register.ts'), 'utf8'))[1]
  const health = (await req('GET', '/api/health')).json.version
  assert.equal(mod, plugin); assert.equal(health, plugin)
})

test('a second terminal gets the next number; an ended one is kept with its resume id', async () => {
  const h = await req('POST', '/api/mod/hello', { chan: 'chan-two', sid: 'sess-2', cwd: '/home/me/dev/shop-api', model: 'Opus' })
  assert.equal(h.json.num, 3); assert.equal(h.json.name, 'shop-api-2')   // 2 went to the docs terminal above
  await req('POST', '/api/mod/sync', { chan: 'chan-two', events: [{ k: 'end', t: Date.now(), reason: 'prompt_input_exit', resume: 'sess-2' }] })
  const s = stream('screen-c')
  const snap = await s.wait(m => m.type === 'hello')
  const two = snap.chans.find(c => c.id === 'chan-two')
  assert.equal(two.status, 'off'); assert.equal(two.resume, 'sess-2')
  assert.ok(snap.past.some(p => p.id === 'sess-2'))
  s.stop()
})

test('a hub that restarted takes a terminal back with what it replays', async () => {
  const r = await req('POST', '/api/mod/sync', { chan: 'chan-new', events: [] })
  assert.equal(r.json.error, 'unknown-chan')
  const t = Date.now()
  await req('POST', '/api/mod/hello', { chan: 'chan-new', sid: 's3', cwd: '/w/docs', replay: [{ k: 'turn', t, id: 'a', text: 'hi' }, { k: 'say', t, text: 'hello' }, { k: 'turnEnd', t, id: 'a', ms: 5 }] })
  const s = stream('screen-d')
  const snap = await s.wait(m => m.type === 'hello')
  const c = snap.chans.find(x => x.id === 'chan-new')
  assert.deepEqual(c.events.map(e => e.k), ['turn', 'say', 'turnEnd'])
  assert.equal(c.status, 'idle')
  s.stop()
})

test('each day keeps its turns, tokens, cost and what was used; a terminal\'s replay is not counted again', async () => {
  const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  await req('POST', '/api/mod/hello', { chan: 'chan-day', mod: '0.2.0', sid: 's-day', cwd: '/home/me/dev/daybook' })
  const t = Date.now(), ctx = { tokens: 1000, window: 200000, percent: 1 }
  await req('POST', '/api/mod/sync', { chan: 'chan-day', events: [
    { k: 'measure', t, ctx, limits: [], usd: 1.0 },
    { k: 'turn', t, id: 'd1', text: 'x' },
    { k: 'tool', t, id: 'dt1', name: 'Read', input: 'a', link: { id: 'Read', kind: 'tool', label: 'Read', src: '組み込み' } },
    { k: 'toolEnd', t, id: 'dt1', out: '1 行' },
    { k: 'turnEnd', t, id: 'd1', ms: 10, usage: { in: 100, out: 20, cw: 30, cr: 500 } },
    { k: 'measure', t: t + 1, ctx, limits: [], usd: 1.25 },
  ] })
  const readUses = async () => { const s = stream('screen-day'); const m = await s.wait(x => x.type === 'hello'); s.stop(); return m }
  let snap = await readUses()
  const day = snap.usage.daily[today], ch = day.chans.find(x => x.name === 'daybook')
  assert.deepEqual([ch.turns, ch.tok, ch.usd], [1, 150, 0.25])
  assert.ok(day.links.some(l => l.id === 'Read' && l.n >= 1))
  assert.ok(!day.links.some(l => l.kind === 'core'))
  const before = { turns: day.turns, read: snap.links.find(l => l.id === 'Read').uses }
  // the hub restarted and a terminal says hello again with what it kept: shown, not counted twice
  await req('POST', '/api/mod/hello', { chan: 'chan-day-2', sid: 's-day2', cwd: '/home/me/dev/daybook2', replay: [
    { k: 'turn', t, id: 'r1', text: 'y' },
    { k: 'tool', t, id: 'rt1', name: 'Read', input: 'b', link: { id: 'Read', kind: 'tool', label: 'Read', src: '組み込み' } },
    { k: 'toolEnd', t, id: 'rt1', out: '2 行' },
    { k: 'turnEnd', t, id: 'r1', ms: 5, usage: { in: 999, out: 0, cw: 0, cr: 0 } },
  ] })
  snap = await readUses()
  assert.equal(snap.usage.daily[today].turns, before.turns)
  assert.equal(snap.links.find(l => l.id === 'Read').uses, before.read)
  assert.deepEqual(snap.chans.find(c => c.id === 'chan-day-2').events.map(e => e.k), ['turn', 'tool', 'toolEnd', 'turnEnd'])
})

test('a project\'s own skills join コミュ when loaded; one from everywhere only when called', async () => {
  await req('POST', '/api/mod/hello', { chan: 'chan-sk', mod: '0.2.0', sid: 's-sk', cwd: '/home/me/dev/skills', links: [
    { id: 'skill:house-style', kind: 'skill', label: 'house-style', src: '.claude', dt: 90 },
    { id: 'skill:dataviz', kind: 'skill', label: 'dataviz', src: '~/.claude', dt: 180 },
    { id: 'agent:Explore', kind: 'agent', label: 'Explore', src: '組み込み', dt: 70 },
  ] })
  const ids = async () => { const s = stream('screen-sk'); const m = await s.wait(x => x.type === 'hello'); s.stop(); return m.links.map(l => l.id) }
  let have = await ids()
  assert.ok(have.includes('skill:house-style'))
  assert.ok(!have.includes('skill:dataviz')); assert.ok(!have.includes('agent:Explore'))
  const t = Date.now()
  await req('POST', '/api/mod/sync', { chan: 'chan-sk', events: [
    { k: 'turn', t, id: 'k1', text: 'グラフ' },
    { k: 'tool', t, id: 'kt1', name: 'Skill', input: 'dataviz', link: { id: 'skill:dataviz', kind: 'skill', label: 'dataviz', src: '~/.claude', dt: 180 } },
    { k: 'toolEnd', t, id: 'kt1', out: '読み込み' },
  ] })
  const s = stream('screen-sk2'); const m = await s.wait(x => x.type === 'hello'); s.stop()
  const dv = m.links.find(l => l.id === 'skill:dataviz')
  assert.equal(dv.uses, 1); assert.equal(dv.src, '~/.claude')
  // a reload (an older terminal still lists everything) brings a project's own, not everywhere's
  await req('POST', '/api/mod/sync', { chan: 'chan-sk', events: [{ k: 'loaded', t: Date.now(), links: [
    { id: 'skill:new-local', kind: 'skill', label: 'new-local', src: '.claude', dt: 40 },
    { id: 'skill:new-global', kind: 'skill', label: 'new-global', src: 'プラグイン tools', dt: 60 },
  ] }] })
  have = await ids()
  assert.ok(have.includes('skill:new-local')); assert.ok(!have.includes('skill:new-global')); assert.ok(have.includes('skill:dataviz'))
})

// a second hub with its own home, port and PATH: how /fog opens the browser depends on where the hub runs
async function hubWith(env, seed) {
  const home = mkdtempSync(join(tmpdir(), 'fogcast-open-')), port = PORT + 1000 + Math.floor(Math.random() * 900)
  if (seed) seed(home)
  const h = spawn(process.execPath, [HUB], { env: { FOGCAST_PORT: String(port), FOGCAST_HOME: home, ...env }, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    try { const r = await new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: '/api/health' }, x => { x.resume(); res(x.statusCode) }).on('error', rej)); if (r === 200) break } catch {}
    await sleep(50)
  }
  const token = readFileSync(join(home, 'token'), 'utf8').trim()
  const open = () => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/mod/open', headers: { 'x-fogcast-token': token, 'content-type': 'application/json' } }, res => { let t = ''; res.on('data', d => { t += d }); res.on('end', () => resolve(JSON.parse(t))) })
    r.on('error', reject); r.end('{}')
  })
  const stop = async () => { await new Promise(r => { h.once('exit', r); h.kill() }); rmSync(home, { recursive: true, force: true }) }
  const post = (path, body) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path, headers: { 'x-fogcast-token': token, 'content-type': 'application/json' } }, res => { let t = ''; res.on('data', d => { t += d }); res.on('end', () => resolve(JSON.parse(t || '{}'))) })
    r.on('error', reject); r.end(JSON.stringify(body))
  })
  const hello = (tz) => new Promise((resolve, reject) => {
    const r = http.get({ host: '127.0.0.1', port, path: '/api/ui/stream', headers: { 'x-fogcast-token': token, 'x-fogcast-client': 'screen-seed', ...(tz ? { 'x-fogcast-tz': tz } : {}) } }, res => {
      let t = ''; res.on('data', d => { t += d; const i = t.indexOf('\n\n'); if (i >= 0) { r.destroy(); resolve(JSON.parse(t.slice(6, i))) } })
    })
    r.on('error', e => { if (e.code !== 'ECONNRESET') reject(e) })
  })
  return { port, token, open, stop, hello, post }
}

test('your status grows from what you did and how you work, from the day it began, and a replay is not counted again', async () => {
  const h = await hubWith({ TZ: 'UTC' })
  try {
    let st = (await h.hello()).usage.status
    assert.deepEqual([st.lv, st.exp, st.rec.days, st.to], [1, 0, 0, 100])
    const t = Date.now(), y = t - 86400e3
    const tool = (id, name) => [{ k: 'tool', t, id, name, input: 'a', link: { id: name, kind: 'tool', label: name, src: '組み込み' } }, { k: 'toolEnd', t, id, out: 'ok' }]
    await h.post('/api/mod/hello', { chan: 'chan-st1', mod: '0.3.0', sid: 's1', cwd: '/home/me/dev/a' })
    // yesterday: one finished turn (a day of work 50, its volume 10)
    await h.post('/api/mod/sync', { chan: 'chan-st1', events: [{ k: 'turn', t: y, id: 'y1', text: 'x' }, { k: 'turnEnd', t: y, id: 'y1', ms: 5, usage: { in: 1000, out: 0, cw: 0, cr: 0 } }] })
    // today: Read for the first time (30), twice; a finished turn of 25,000 tokens and a stopped one of 10,000
    await h.post('/api/mod/sync', { chan: 'chan-st1', events: [
      { k: 'turn', t, id: 't1', text: 'x' }, ...tool('r1', 'Read'), ...tool('r2', 'Read'),
      { k: 'turnEnd', t, id: 't1', ms: 5, usage: { in: 5000, out: 5000, cw: 15000, cr: 90000 } },
      { k: 'turn', t, id: 't2', text: 'y' }, { k: 'turnEnd', t, id: 't2', ms: 5, aborted: true, usage: { in: 10000, out: 0, cw: 0, cr: 0 } },
    ] })
    st = (await h.hello()).usage.status
    // today: first 30 + two days running 50 + 10 + volume 1 turn × 10 + 35,000 tokens / 10,000 = 13
    assert.deepEqual(st.today, { xp: 103, vol: 13, habit: 60, first: 30, done: 1, tok: 35000 })
    assert.equal(st.exp, 60 + 103)
    assert.deepEqual([st.lv, st.from, st.to], [2, 100, 300])
    assert.deepEqual([st.rec.days, st.rec.streak, st.rec.best, st.rec.turns, st.rec.kinds], [2, 2, 2, 2, 1])
    assert.deepEqual(st.stats.map(s => [s.k, s.p, s.r]), [['inq', 2, 0], ['make', 0, 0], ['run', 0, 0], ['lead', 0, 0], ['ext', 0, 0]])
    assert.deepEqual(st.top.map(x => [x.id, x.n]), [['Read', 2]])
    // the hub restarted and a terminal replays what it kept: shown, not counted
    await h.post('/api/mod/hello', { chan: 'chan-st2', mod: '0.3.0', sid: 's2', cwd: '/home/me/dev/b', replay: [
      { k: 'turn', t, id: 'q1', text: 'z' }, ...tool('q2', 'Bash'), { k: 'turnEnd', t, id: 'q1', ms: 5, usage: { in: 90000, out: 0, cw: 0, cr: 0 } },
    ] })
    assert.equal((await h.hello()).usage.status.exp, 163)
    // volume has no cap a day: 46 turns × 10 + 485,000 tokens / 10,000 = 508
    const many = []; for (let i = 0; i < 45; i++) many.push({ k: 'turn', t, id: `m${i}`, text: 'm' }, { k: 'turnEnd', t, id: `m${i}`, ms: 5, usage: { in: 10000, out: 0, cw: 0, cr: 0 } })
    await h.post('/api/mod/sync', { chan: 'chan-st1', events: [...many, ...tool('w1', 'Write')] })
    st = (await h.hello()).usage.status
    assert.deepEqual([st.today.vol, st.today.first, st.today.done], [508, 60, 46])
    assert.equal(st.stats.find(s => s.k === 'make').p, 1)
  } finally { await h.stop() }
})

test('days are counted in the screen\'s time zone, whatever clock the hub runs on', async () => {
  const h = await hubWith({ TZ: 'UTC' })
  try {
    await h.hello('Asia/Tokyo')
    const t = Date.UTC(2026, 9, 6, 16, 30)        // 01:30 on the 7th in Tokyo, still the 6th in UTC
    await h.post('/api/mod/hello', { chan: 'chan-tz1', mod: '0.3.0', sid: 'sz', cwd: '/home/me/dev/z' })
    await h.post('/api/mod/sync', { chan: 'chan-tz1', events: [{ k: 'turn', t, id: 'z', text: 'x' }, { k: 'turnEnd', t, id: 'z', ms: 5, usage: { in: 100, out: 0, cw: 0, cr: 0 } }] })
    const m = await h.hello()
    assert.ok(m.usage.daily['2026-10-07']); assert.ok(!m.usage.daily['2026-10-06'])
  } finally { await h.stop() }
})

test('a state kept by an earlier version lets go of everywhere\'s skills and agents that were never called', async () => {
  const L = (id, kind, src, uses) => [id, { id, kind, label: id.split(':')[1], src, uses, last: uses ? Date.now() : null, days: {}, recent: [], dt: 100, first: Date.now() }]
  const h = await hubWith({}, home => writeFileSync(join(home, 'state.json'), JSON.stringify({ links: Object.fromEntries([
    L('skill:house-style', 'skill', '.claude', 0), L('skill:dataviz', 'skill', '~/.claude', 0), L('skill:pdf', 'skill', 'プラグイン docs', 3),
    L('agent:Explore', 'agent', '組み込み', 0), L('agent:reviewer', 'agent', '.claude', 0), L('mcp:github', 'mcp', 'MCP', 0),
  ]) })))
  try {
    const ids = (await h.hello()).links.map(l => l.id).sort()
    assert.deepEqual(ids, ['agent:reviewer', 'mcp:github', 'skill:house-style', 'skill:pdf'])
  } finally { await h.stop() }
})

test('under WSL, /fog opens the Windows browser through rundll32.exe, key and all', async () => {
  const bin = mkdtempSync(join(tmpdir(), 'fogcast-bin-')), seen = join(bin, 'seen.txt')
  writeFileSync(join(bin, 'rundll32.exe'), `#!/bin/sh\necho "$@" > "${seen}"\n`, { mode: 0o755 })
  const h = await hubWith({ PATH: bin, WSL_DISTRO_NAME: 'Ubuntu' })
  try {
    assert.equal((await h.open()).opened, true)
    await sleep(300)
    assert.equal(readFileSync(seen, 'utf8').trim(), `url.dll,FileProtocolHandler http://127.0.0.1:${h.port}/#k=${h.token}`)
  } finally { await h.stop(); rmSync(bin, { recursive: true, force: true }) }
})

test('with no way to open a browser, /fog is told so instead of "opened"', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'fogcast-nobin-'))
  const h = await hubWith({ PATH: empty })
  try { assert.equal((await h.open()).opened, false) } finally { await h.stop(); rmSync(empty, { recursive: true, force: true }) }
  // there, but failing: xdg-open with no browser to hand exits 3
  const bin = mkdtempSync(join(tmpdir(), 'fogcast-xdg-'))
  writeFileSync(join(bin, 'xdg-open'), '#!/bin/sh\nexit 3\n', { mode: 0o755 })
  const h2 = await hubWith({ PATH: bin })
  try { assert.equal((await h2.open()).opened, false) } finally { await h2.stop(); rmSync(bin, { recursive: true, force: true }) }
})


test('what the screen sends shows on every screen at once, until its turn starts; one the terminal could not take says so', async () => {
  await req('POST', '/api/mod/hello', { chan: 'chan-pend', sid: 'sess-p', cwd: '/home/me/dev/pend', model: 'Opus' })
  const s = stream('screen-p'); await s.wait(m => m.type === 'hello')
  const r = await req('POST', '/api/ui/send', { chan: 'chan-pend', text: '次はテストを', local: 'lid-1' })
  assert.equal(r.json.ok, true); assert.ok(r.json.id)
  const shown = await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-pend' && m.chan.pending?.length === 1)
  assert.deepEqual([shown.chan.pending[0].text, shown.chan.pending[0].local, shown.chan.pending[0].id], ['次はテストを', 'lid-1', r.json.id])
  const sync = await req('POST', '/api/mod/sync', { chan: 'chan-pend', events: [] })
  assert.equal(sync.json.commands.find(c => c.type === 'prompt').id, r.json.id)
  // the terminal starts it: the turn names the id, and the bubble gives way
  await req('POST', '/api/mod/sync', { chan: 'chan-pend', events: [{ k: 'turn', t: Date.now(), id: 'tp', text: '次はテストを', via: 'screen', cid: r.json.id }] })
  assert.equal((await s.wait(m => m.type === 'ev' && m.chan === 'chan-pend' && m.ev.k === 'turn')).ev.cid, r.json.id)
  await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-pend' && m.chan.pending.length === 0)
  const r2 = await req('POST', '/api/ui/send', { chan: 'chan-pend', text: 'もう一つ' })
  await req('POST', '/api/mod/sync', { chan: 'chan-pend', events: [{ k: 'did', t: Date.now(), cid: r2.json.id, what: 'prompt', ok: false, error: 'busy' }] })
  assert.equal((await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-pend' && m.chan.pending[0]?.err)).chan.pending[0].err, 'busy')
  await req('POST', '/api/ui/unsend', { chan: 'chan-pend', id: r2.json.id })
  await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-pend' && m.chan.pending.length === 0)
  s.stop()
})

test('a question Claude asks can be answered from the screen, and the answer goes to its terminal', async () => {
  await req('POST', '/api/mod/hello', { chan: 'chan-q', sid: 'sess-q', cwd: '/home/me/dev/q', model: 'Opus' })
  const s = stream('screen-q'); await s.wait(m => m.type === 'hello')
  const t = Date.now()
  await req('POST', '/api/mod/sync', { chan: 'chan-q', events: [
    { k: 'turn', t, id: 'tq', text: '進め方を決めて' },
    { k: 'tool', t, id: 'tu-q', name: 'AskUserQuestion', input: 'どちらで？', link: { id: 'AskUserQuestion', kind: 'tool', label: 'AskUserQuestion', src: '組み込み' } },
    { k: 'question', t, id: 'tu-q', qs: [{ q: 'どちらで進めますか？', h: '方式', multi: false, opts: [{ l: 'A案', d: '速い' }, { l: 'B案', d: '安全' }] }, { q: 'どれを含めますか？', h: '範囲', multi: true, opts: [{ l: 'テスト', d: '' }, { l: '文書', d: '' }, { l: '型', d: '' }] }] },
  ] })
  const w = await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-q' && m.chan.ask === 'tu-q')
  assert.equal(w.chan.status, 'wait'); assert.match(w.chan.now, /質問/)
  // half an answer, an option that is not there, two picks for one choice, another question: refused
  assert.equal((await req('POST', '/api/ui/question', { chan: 'chan-q', id: 'tu-q', answers: [{ pick: [1] }] })).status, 400)
  assert.equal((await req('POST', '/api/ui/question', { chan: 'chan-q', id: 'tu-q', answers: [{ pick: [5] }, { pick: [0] }] })).status, 400)
  assert.equal((await req('POST', '/api/ui/question', { chan: 'chan-q', id: 'tu-q', answers: [{ pick: [0, 1] }, { pick: [0] }] })).status, 400)
  assert.equal((await req('POST', '/api/ui/question', { chan: 'chan-q', id: 'tu-q', answers: [{ pick: [] }, { pick: [0] }] })).status, 400)
  assert.equal((await req('POST', '/api/ui/question', { chan: 'chan-q', id: 'nope', answers: [{ pick: [0] }, { pick: [0] }] })).status, 409)
  assert.equal((await req('POST', '/api/ui/question', { chan: 'chan-q', id: 'tu-q', answers: [{ pick: [1] }, { pick: [2, 0], text: 'CI も' }] })).json.ok, true)
  const a = (await req('POST', '/api/mod/sync', { chan: 'chan-q', events: [] })).json.commands.find(c => c.type === 'answer')
  assert.equal(a.qid, 'tu-q'); assert.deepEqual(a.answers, [{ pick: [1], text: '' }, { pick: [2, 0], text: 'CI も' }])
  // the terminal says how it ended: the question closes on every screen
  await req('POST', '/api/mod/sync', { chan: 'chan-q', events: [{ k: 'questionEnd', t: Date.now(), id: 'tu-q', by: 'screen', answers: { 'どちらで進めますか？': 'B案', 'どれを含めますか？': 'テスト, 型, CI も' } }, { k: 'toolEnd', t: Date.now(), id: 'tu-q', out: '完了' }] })
  const done = await s.wait(m => m.type === 'ev' && m.chan === 'chan-q' && m.ev.k === 'questionEnd')
  assert.equal(done.ev.by, 'screen'); assert.equal(done.ev.answers['どちらで進めますか？'], 'B案')
  assert.match((await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-q' && m.chan.ask === null && m.chan.status === 'work')).chan.now, /この画面で答えました/)
  assert.equal((await req('POST', '/api/ui/question', { chan: 'chan-q', id: 'tu-q', answers: [{ pick: [0] }, { pick: [0] }] })).status, 409)
  s.stop()
})

test('the screen puts away channels whose terminal has gone, and never one still reporting', async () => {
  await req('POST', '/api/mod/hello', { chan: 'chan-gone', sid: 'sess-g', cwd: '/home/me/dev/gone', model: 'Opus' })
  await req('POST', '/api/mod/hello', { chan: 'chan-live', sid: 'sess-l', cwd: '/home/me/dev/live', model: 'Opus' })
  await req('POST', '/api/mod/sync', { chan: 'chan-gone', events: [{ k: 'end', t: Date.now(), reason: 'exit', resume: 'sess-g' }] })
  const s = stream('screen-g'); await s.wait(m => m.type === 'hello')
  assert.equal((await req('POST', '/api/ui/forget', { chans: ['chan-gone', 'chan-live'] })).json.gone, 1)
  await s.wait(m => m.type === 'gone' && m.chan === 'chan-gone')
  const s2 = stream('screen-g2'); const snap = await s2.wait(m => m.type === 'hello')
  assert.ok(!snap.chans.some(c => c.id === 'chan-gone')); assert.ok(snap.chans.some(c => c.id === 'chan-live'))
  assert.ok(snap.past.some(p => p.id === 'sess-g'))                         // its session can still be resumed
  assert.equal((await req('POST', '/api/mod/sync', { chan: 'chan-gone', events: [] })).json.error, 'unknown-chan')   // were it to come back, it says hello anew
  s.stop(); s2.stop()
})

test('a skill keeps its own description for its card; the next-prompt suggestion stands until a turn starts', async () => {
  await req('POST', '/api/mod/hello', { chan: 'chan-d', sid: 'sess-d', cwd: '/home/me/dev/d', model: 'Opus', links: [{ id: 'skill:house-rules', kind: 'skill', label: 'house-rules', src: '.claude', dt: 40, desc: 'このリポジトリの書き方。\n命名とコミットの規則。' }, { id: 'agent:checker', kind: 'agent', label: 'checker', src: '.claude', dt: 30 }] })
  const s = stream('screen-d'); const snap = await s.wait(m => m.type === 'hello')
  assert.equal(snap.links.find(l => l.id === 'skill:house-rules').desc, 'このリポジトリの書き方。\n命名とコミットの規則。')
  await req('POST', '/api/mod/sync', { chan: 'chan-d', events: [{ k: 'desc', t: Date.now(), id: 'agent:checker', desc: '変更を確かめるエージェント' }, { k: 'suggest', t: Date.now(), text: 'テストを実行して' }] })
  assert.equal((await s.wait(m => m.type === 'links' && m.links.some(x => x.id === 'agent:checker' && x.desc))).links.find(x => x.id === 'agent:checker').desc, '変更を確かめるエージェント')
  await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-d' && m.chan.suggest === 'テストを実行して')
  await req('POST', '/api/mod/sync', { chan: 'chan-d', events: [{ k: 'turn', t: Date.now(), id: 'td', text: 'テストを実行して' }] })
  await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-d' && m.chan.suggest === '' && m.chan.status === 'work')
  // one sent from a screen puts it away at once, on every screen
  await req('POST', '/api/mod/sync', { chan: 'chan-d', events: [{ k: 'turnEnd', t: Date.now(), id: 'td', ms: 10 }, { k: 'suggest', t: Date.now(), text: 'コミットして' }] })
  await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-d' && m.chan.suggest === 'コミットして')
  await req('POST', '/api/ui/send', { chan: 'chan-d', text: '先に README を' })
  await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-d' && m.chan.suggest === '' && m.chan.pending.length === 1)
  s.stop()
})

// ---------------------------------------------------------------- commands: resume, model, effort
const U = n => `0000000${n}-aaaa-4bbb-8ccc-dddddddddddd`.slice(-36)
const row = (o) => JSON.stringify(o)
function convo(dir, id, rowsList, ageMin) {
  const p = join(dir, `${id}.jsonl`)
  writeFileSync(p, rowsList.map(row).join('\n') + '\n')
  const t = (Date.now() - ageMin * 60e3) / 1000; utimesSync(p, t, t)
  return p
}
const say = (role, text, extra = {}) => role === 'user'
  ? { type: 'user', message: { role: 'user', content: text }, timestamp: new Date().toISOString(), ...extra }
  : { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, timestamp: new Date().toISOString(), ...extra }

test('the resume list is read from the project\'s conversation files: the one open here and empty ones are left out, one open elsewhere is marked', async () => {
  const dir = join(HOME, 'projects', '-home-me-dev-notes'); mkdirSync(dir, { recursive: true })
  convo(dir, U(1), [{ type: 'mode', sessionId: U(1) }, say('user', 'first session about apples'), say('ai', 'ok'), { type: 'assistant', message: { role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'No response requested.' }] } }], 30)
  convo(dir, U(2), [say('user', 'second session about bananas'), say('ai', 'ok'), { type: 'custom-title', customTitle: 'bananas-talk', sessionId: U(2) }, { type: 'last-prompt', lastPrompt: 'and more bananas', sessionId: U(2) }], 5)
  convo(dir, U(3), [say('user', 'the one open here')], 1)
  convo(dir, U(4), [{ type: 'user', message: { role: 'user', content: '<command-name>/model</command-name>' } }, { type: 'user', isMeta: true, message: { role: 'user', content: 'hidden' } }], 2)
  convo(dir, U(5), [say('user', 'open in another terminal')], 10)
  writeFileSync(join(dir, 'notes.jsonl'), row(say('user', 'not a conversation')) + '\n')
  await req('POST', '/api/mod/hello', { chan: 'chan-res', mod: '0.5.0', sid: U(3), cwd: '/home/me/dev/notes', tp: join(dir, `${U(3)}.jsonl`), tdir: dir })
  await req('POST', '/api/mod/hello', { chan: 'chan-oth', sid: U(5), cwd: '/home/me/dev/notes' })
  const r = await req('POST', '/api/ui/sessions', { chan: 'chan-res' })
  assert.equal(r.json.ok, true)
  assert.deepEqual(r.json.sessions.map(x => x.id), [U(2), U(5), U(1)])             // newest first
  const [b, e, a] = r.json.sessions
  assert.equal(b.title, 'bananas-talk'); assert.equal(b.first, 'second session about bananas'); assert.equal(b.last, 'and more bananas')
  assert.equal(a.title, ''); assert.equal(a.first, 'first session about apples')
  assert.equal(e.open.name.startsWith('notes'), true)
  // a terminal whose folder is not known yet says so
  await req('POST', '/api/mod/hello', { chan: 'chan-nodir', sid: U(9), cwd: '/home/me/dev/x' })
  const none = await req('POST', '/api/ui/sessions', { chan: 'chan-nodir' })
  assert.equal(none.json.ok, false)
})

test('conversations are listed as they really look: the editor\'s tags, a pasted image, a summary first, a name Claude Code made up; the folder is found from the terminal\'s own', async () => {
  const dir = join(HOME, 'projects', '-home-me-dev-vs'); mkdirSync(dir, { recursive: true })
  const ide = { type: 'text', text: '<ide_opened_file>The user opened the file /home/me/dev/vs/a.ts in the IDE. This may or may not be related to the current task.</ide_opened_file>' }
  convo(dir, U(11), [{ type: 'mode', sessionId: U(11) }, { type: 'user', message: { role: 'user', content: [ide, { type: 'text', text: 'VS Code から頼んだこと' }] } }, say('ai', 'はい'),
    { type: 'ai-title', aiTitle: 'VS Code での修正', sessionId: U(11) }, { type: 'last-prompt', lastPrompt: 'VS Code から頼んだこと', sessionId: U(11) }], 5)
  const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'A'.repeat(200 * 1024) } }
  convo(dir, U(12), [{ type: 'user', message: { role: 'user', content: [image, { type: 'text', text: '画像つきの依頼' }] } }, say('ai', '見ました'), say('user', '次の依頼'),
    { type: 'last-prompt', lastPrompt: '次の依頼', sessionId: U(12) }], 6)
  convo(dir, U(13), [{ type: 'user', isCompactSummary: true, isVisibleInTranscriptOnly: true, message: { role: 'user', content: 'This session is being continued. ' + 'x'.repeat(150 * 1024) } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } }, say('user', '要約のあとの依頼'), { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } }], 7)
  const huge = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'B'.repeat(1200 * 1024) } }
  convo(dir, U(14), [{ type: 'user', message: { role: 'user', content: [huge, { type: 'text', text: 'とても大きい画像' }] } }, say('ai', 'ok'), { type: 'last-prompt', lastPrompt: 'その続き', sessionId: U(14) }], 8)
  convo(dir, U(15), [{ type: 'mode', sessionId: U(15) }, { type: 'permission-mode', permissionMode: 'auto', sessionId: U(15) }], 9)
  // no conversation file named yet (an older Claude Code, or none written): the folder comes from Claude Code's own and the terminal's path
  await req('POST', '/api/mod/hello', { chan: 'chan-vs', mod: '0.5.2', sid: U(19), cwd: '/home/me/dev/vs', cfg: HOME })
  const r = await req('POST', '/api/ui/sessions', { chan: 'chan-vs' })
  assert.equal(r.json.ok, true)
  assert.deepEqual(r.json.sessions.map(x => [x.id, x.title, x.first, x.last]), [
    [U(11), 'VS Code での修正', 'VS Code から頼んだこと', 'VS Code から頼んだこと'],
    [U(12), '', '画像つきの依頼', '次の依頼'],
    [U(13), '', '要約のあとの依頼', ''],
    [U(14), '', '', 'その続き'],            // its first prompt lies past what is read: it goes by its last
  ])
  // a resumed conversation's history: a command that set Claude working reads as its request; one that only printed, not at all
  const cmdRow = (name, args) => ({ type: 'user', message: { role: 'user', content: `<command-name>/${name}</command-name>\n<command-message>${name}</command-message>\n<command-args>${args}</command-args>` } })
  convo(dir, U(16), [say('user', 'ふつうの依頼'), say('ai', 'やりました'),
    cmdRow('model', 'sonnet'), { type: 'user', message: { role: 'user', content: '<local-command-stdout>Set model to Sonnet 5.5</local-command-stdout>' } },
    { type: 'assistant', message: { role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'No response requested.' }] } },
    cmdRow('init', ''), { type: 'user', isMeta: true, message: { role: 'user', content: [{ type: 'text', text: 'Please analyze this codebase…' }] } }, say('ai', 'CLAUDE.md を作りました')], 3)
  const s = stream('screen-vs'); await s.wait(m => m.type === 'hello')
  await req('POST', '/api/mod/sync', { chan: 'chan-vs', events: [{ k: 'resumed', t: Date.now(), from: U(19), sid: U(16), title: '', tp: join(dir, `${U(16)}.jsonl`), source: 'resume' }] })
  const hist = await s.wait(m => m.type === 'ev' && m.ev.k === 'hist' && m.ev.sid === U(16))
  assert.deepEqual(hist.ev.items.map(x => [x.u, x.a]), [['ふつうの依頼', 'やりました'], ['/init', 'CLAUDE.md を作りました']])
  s.stop()
})

test('a resume from the screen goes to its terminal; the one open here or elsewhere, or not an id, is refused', async () => {
  assert.equal((await req('POST', '/api/ui/resume', { chan: 'chan-res', sid: U(2) })).json.ok, true)
  assert.equal((await req('POST', '/api/ui/resume', { chan: 'chan-res', sid: U(3) })).status, 409)
  assert.equal((await req('POST', '/api/ui/resume', { chan: 'chan-res', sid: U(5) })).status, 409)
  assert.equal((await req('POST', '/api/ui/resume', { chan: 'chan-res', sid: '../../etc/passwd' })).status, 400)
  const sync = await req('POST', '/api/mod/sync', { chan: 'chan-res', events: [] })
  assert.deepEqual(sync.json.commands.map(c => [c.type, c.sid]), [['resume', U(2)]])
})

test('a resume swaps the channel\'s conversation: it stays open, the one left is kept to come back to, and its last exchanges are read in', async () => {
  const dir = join(HOME, 'projects', '-home-me-dev-notes')
  const s = stream('screen-res')
  await s.wait(m => m.type === 'hello')
  const t = Date.now()
  await req('POST', '/api/mod/sync', { chan: 'chan-res', events: [{ k: 'turn', t, id: 'tr1', text: 'the one open here' }, { k: 'turnEnd', t: t + 10, id: 'tr1', ms: 10 }] })
  await req('POST', '/api/mod/sync', { chan: 'chan-res', events: [{ k: 'resumed', t: t + 20, from: U(3), sid: U(1), title: '', tp: join(dir, `${U(1)}.jsonl`), source: 'resume' }] })
  const ev = await s.wait(m => m.type === 'ev' && m.ev.k === 'resumed')
  assert.equal(ev.ev.from, U(3)); assert.equal(ev.ev.sid, U(1)); assert.equal(ev.ev.tp, undefined)
  const hist = await s.wait(m => m.type === 'ev' && m.ev.k === 'hist')
  assert.deepEqual(hist.ev.items.map(x => [x.u, x.a]), [['first session about apples', 'ok']])
  assert.equal(hist.ev.label, 'first session about apples')                          // never named: it goes by what it began with
  const ch = await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-res' && m.chan.sid === U(1))
  assert.equal(ch.chan.status, 'idle')                                                // not ended: the terminal goes on
  s.stop()
  const again = stream('screen-res-2'); const h = await again.wait(m => m.type === 'hello')
  assert.equal(h.past.some(p => p.id === U(3) && p.title === 'the one open here'), true)
  // back to the one never named: it goes by what it began with
  await req('POST', '/api/mod/sync', { chan: 'chan-res', events: [{ k: 'resumed', t: t + 30, from: U(1), sid: U(3), title: '', tp: join(dir, `${U(3)}.jsonl`), source: 'resume' }] })
  const back = await again.wait(m => m.type === 'ev' && m.ev.k === 'resumed' && m.ev.sid === U(3))
  assert.equal(back.ev.title, ''); assert.equal(back.ev.label, 'the one open here')
  again.stop()
  const third = stream('screen-res-3'); const h3 = await third.wait(m => m.type === 'hello'); third.stop()
  assert.equal(h3.past.find(p => p.id === U(1))?.title, 'first session about apples')   // the one left is kept by its beginning
})

test('model and effort from the screen are checked against the terminal\'s own choices; a command\'s printed line fills its row once', async () => {
  await req('POST', '/api/mod/hello', { chan: 'chan-me', mod: '0.5.0', sid: U(7), cwd: '/home/me/dev/me', models: { options: ['default', 'sonnet', 'opus', 'opus[1m]'], value: 'opus' }, efforts: ['low', 'medium', 'high', 'Bad Word'], effort: 'medium' })
  // a terminal not yet restarted after the update does not know these requests: it is told so instead
  await req('POST', '/api/mod/hello', { chan: 'chan-old', mod: '0.4.0', sid: U(8), cwd: '/home/me/dev/me' })
  for (const [path, body] of [['/api/ui/model', { value: 'sonnet' }], ['/api/ui/effort', { value: 'high' }], ['/api/ui/resume', { sid: U(7) }]]) {
    const r = await req('POST', path, { chan: 'chan-old', ...body })
    assert.equal(r.status, 409); assert.match(r.json.error, /起動し直す/)
  }
  assert.equal((await req('POST', '/api/ui/model', { chan: 'chan-me', value: 'opus[1m]' })).json.ok, true)
  assert.equal((await req('POST', '/api/ui/model', { chan: 'chan-me', value: 'gpt-9' })).status, 400)
  assert.equal((await req('POST', '/api/ui/effort', { chan: 'chan-me', value: 'high' })).json.ok, true)
  assert.equal((await req('POST', '/api/ui/effort', { chan: 'chan-me', value: 'Bad Word' })).status, 400)
  const sync = await req('POST', '/api/mod/sync', { chan: 'chan-me', events: [] })
  assert.deepEqual(sync.json.commands.map(c => [c.type, c.value]), [['model', 'opus[1m]'], ['effort', 'high']])
  const s = stream('screen-me')
  const h = await s.wait(m => m.type === 'hello')
  const me = h.chans.find(c => c.id === 'chan-me')
  assert.deepEqual(me.efforts, ['low', 'medium', 'high']); assert.equal(me.effort, 'medium'); assert.equal(me.models.value, 'opus')
  const t = Date.now()
  await req('POST', '/api/mod/sync', { chan: 'chan-me', events: [
    { k: 'cmd', t, name: 'effort', args: 'high', text: '', via: 'screen', run: 'r1' },
    { k: 'cmd', t: t + 1, name: 'effort', args: 'low', text: '', run: 'r2' },
    { k: 'cmdOut', t: t + 5, name: 'effort', text: 'Set effort level to high (saved as your default for new sessions)', run: 'r1' },
    { k: 'cmdOut', t: t + 6, name: 'effort', text: 'a second line', run: 'r1' },
    { k: 'info', t: t + 7, effort: 'high' },
    { k: 'cmd', t: t + 8, name: 'diff', args: '', text: 'The diff panel shows git changes', run: 'r3' },
    { k: 'cmdOut', t: t + 9, name: 'diff', text: 'The diff panel shows git changes', run: 'r3' },
    { k: 'model', t: t + 10, from: 'claude-opus-5-5', to: 'claude-sonnet-5-5', src: 'command', asked: 'opus' },
    { k: 'info', t: t + 10, effortUsed: 'xhigh' },
    { k: 'models', t: t + 10, options: ['default', 'sonnet', 'opus', 'opus[1m]'], value: 'sonnet' },
    { k: 'cmdOut', t: t + 11, name: 'resume', args: '0f0f0f0f-0000-4000-8000-000000000000', via: 'screen', text: 'Session 0f0f0f0f-0000-4000-8000-000000000000 was not found.' },
  ] })
  const cmd = await s.wait(m => m.type === 'ev' && m.ev.k === 'cmd' && m.ev.name === 'effort' && m.ev.args === 'high')
  const out = await s.wait(m => m.type === 'ev' && m.ev.k === 'cmdOut' && m.ev.name === 'effort')
  assert.equal(out.ev.ref, cmd.ev.seq)                       // its own run's row, though a later /effort had a row too
  await s.wait(m => m.type === 'ev' && m.ev.k === 'model')
  const lone = await s.wait(m => m.type === 'ev' && m.ev.k === 'cmdOut' && m.ev.name === 'resume')
  assert.equal(lone.ev.ref, undefined); assert.equal(lone.ev.via, 'screen'); assert.equal(lone.ev.args, '0f0f0f0f-0000-4000-8000-000000000000')
  assert.equal(s.msgs.filter(m => m.type === 'ev' && m.ev.k === 'cmdOut').length, 2)   // the second line and the echo of a row that had its text are dropped
  const ch = await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-me' && m.chan.effort === 'high')
  assert.equal(ch.chan.model, 'claude-sonnet-5-5'); assert.equal(ch.chan.effortUsed, 'xhigh')
  // the picker marks what /config holds, as the terminal read it back; a switch's own word for it is not taken
  assert.equal(s.msgs.some(m => m.type === 'chan' && m.chan.id === 'chan-me' && m.chan.models && m.chan.models.value === 'opus' && m !== h), false)
  const marked = await s.wait(m => m.type === 'chan' && m.chan.id === 'chan-me' && m.chan.models && m.chan.models.value === 'sonnet')
  assert.equal(marked.chan.models.options.includes('sonnet'), true)
  assert.equal(s.msgs.filter(m => m.type === 'ev' && m.ev.k === 'models').length, 0)       // state, not a line of the conversation
  s.stop()
})

test('@ in the message box lists the terminal\'s files: what git does not ignore, folders too, best match first; outside a repository the folder is walked', async () => {
  const proj = mkdtempSync(join(tmpdir(), 'fogcast-proj-'))
  const put = (rel, text = 'x', ageMin = 60) => { const f = join(proj, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); const t = (Date.now() - ageMin * 60e3) / 1000; utimesSync(f, t, t) }
  put('README.md', '# r', 50); put('src/app.ts', 'a', 5); put('src/lib/apply.ts', 'b', 30); put('src/lib/util.ts', 'c', 40); put('docs/api.md', 'd', 20)
  put('secret.env', 's', 1); put('node_modules/pkg/index.js', 'n', 2); put('.gitignore', 'secret.env\nnode_modules/\n', 90)
  const git = spawnSync('git', ['-C', proj, 'init', '-q']).status === 0
  await req('POST', '/api/mod/hello', { chan: 'chan-files', mod: '0.5.6', sid: U(30), cwd: proj })
  const files = async q => (await req('POST', '/api/ui/files', { chan: 'chan-files', q })).json
  const app = await files('app')
  assert.equal(app.ok, true)
  assert.deepEqual(app.files.slice(0, 2).map(f => f.p), ['src/app.ts', 'src/lib/apply.ts'])     // the name that starts with it, the shorter first
  assert.equal((await files('src/l')).files[0].p, 'src/lib')                                  // a folder, by its path
  assert.equal((await files('src/l')).files[0].d, true)
  const all = (await files('s')).files.map(f => f.p)
  assert.equal(all.includes('node_modules/pkg/index.js'), false)
  if (git) assert.equal(all.includes('secret.env'), false)                                     // ignored by git, as the terminal's @ leaves it out
  const recent = await files('')
  assert.equal(recent.recent, true)
  assert.deepEqual(recent.files.slice(0, 2).map(f => f.p), git ? ['src/app.ts', 'docs/api.md'] : ['secret.env', 'src/app.ts'])
  assert.equal((await files('zzzq')).files.length, 0)
  assert.equal((await req('POST', '/api/ui/files', { chan: 'nope', q: 'a' })).status, 404)
  // outside a repository: walked, the folders that are never meant left out
  const plain = mkdtempSync(join(tmpdir(), 'fogcast-plain-'))
  mkdirSync(join(plain, 'node_modules', 'x'), { recursive: true }); writeFileSync(join(plain, 'node_modules', 'x', 'i.js'), 'n'); writeFileSync(join(plain, 'notes.txt'), 'n')
  await req('POST', '/api/mod/hello', { chan: 'chan-plain', mod: '0.5.6', sid: U(31), cwd: plain })
  const listed = async q => (await req('POST', '/api/ui/files', { chan: 'chan-plain', q })).json.files.map(f => f.p)
  assert.deepEqual(await listed('notes'), ['notes.txt'])
  assert.deepEqual(await listed('i.js'), [])
  // a terminal whose folder is gone: said so
  await req('POST', '/api/mod/hello', { chan: 'chan-gone', mod: '0.5.6', sid: U(32), cwd: join(plain, 'gone') })
  const gone = (await req('POST', '/api/ui/files', { chan: 'chan-gone', q: 'a' })).json
  assert.equal(gone.ok, false)
  rmSync(proj, { recursive: true, force: true }); rmSync(plain, { recursive: true, force: true })
})

test('a turn carries the files its prompt named with @, as the terminal attached them', async () => {
  await req('POST', '/api/mod/hello', { chan: 'chan-att', mod: '0.5.6', sid: U(33), cwd: '/home/me/dev/att' })
  const s = stream('screen-att'); await s.wait(m => m.type === 'hello')
  await req('POST', '/api/mod/sync', { chan: 'chan-att', events: [{ k: 'turn', t: Date.now(), id: 'ta', text: '@src/a.ts を見て', via: 'screen', files: [
    { p: 'src/a.ts', kind: 'file', lines: 120, shown: 120 }, { p: 'src/', kind: 'dir', lines: 4 }, { p: 'x.ts', err: 'missing' }, { p: 'y', err: '<script>' }, { nope: 1 },
  ] }] })
  const t = await s.wait(m => m.type === 'ev' && m.ev.k === 'turn' && m.ev.id === 'ta')
  assert.deepEqual(t.ev.files, [
    { p: 'src/a.ts', kind: 'file', lines: 120, shown: 120 }, { p: 'src/', kind: 'dir', lines: 4 }, { p: 'x.ts', kind: 'file', err: 'missing' }, { p: 'y', kind: 'file' },
  ])
  s.stop()
})
