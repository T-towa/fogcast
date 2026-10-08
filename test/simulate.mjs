// Plays two terminals against a running hub, the way the mod would report them.
// For trying the screen without Claude Code:  node test/simulate.mjs
//   FOGCAST_PORT, FOGCAST_HOME   where the hub is (defaults: 4317, ~/.fogcast)
//   SIM_LOG                      a file to append what the screen sent (JSON lines)
//   SIM_CTL                      a file this script watches: "ask" makes ch.1 ask for approval, "question" makes it ask
//                                a multiple-choice question (answered from the screen), "end" ends ch.2's terminal
// Both say they run this version of the mod, so a pairing code reaches them as the hub hands it to a
// real terminal (the mod frames it above the prompt); here it is written to SIM_LOG as {pair}.
import { readFileSync, appendFileSync, existsSync, rmSync, mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.FOGCAST_PORT) || 4317
const DIR = process.env.FOGCAST_HOME || join(homedir(), '.fogcast')
const TOKEN = readFileSync(join(DIR, 'token'), 'utf8').trim()
const LOG = process.env.SIM_LOG, CTL = process.env.SIM_CTL
const HOME = homedir()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = o => { if (LOG) appendFileSync(LOG, JSON.stringify(o) + '\n'); else console.log(JSON.stringify(o)) }

async function post(path, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fogcast-token': TOKEN }, body: JSON.stringify(body) })
  return r.json()
}
const BUILTIN = [['compact', '会話を要約してコンテキストを空ける', '<要約の指示>'], ['clear', '会話をリセットして新しいセッションにする'], ['context', 'コンテキストの内訳を表示する'], ['model', 'モデルを切り替える', '[model]'],
  ['effort', '考える深さを変える', '[low|medium|high|xhigh|max|auto]'], ['resume', '前の会話に戻る', '[conversation id or search term]'], ['usage', '使用量を表示する'], ['init', 'CLAUDE.md を作る']]
const MODELS = { options: ['default', 'sonnet', 'opus', 'haiku', 'opus[1m]', 'opusplan'], value: 'default' }
const MODEL_ID = { default: 'claude-opus-5-5', opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5', 'opus[1m]': 'claude-opus-5-5[1m]', opusplan: 'claude-opus-5-5' }
// ch.1's earlier conversations, as Claude Code keeps them (one file each), for the screen's /resume list
const CONVS = mkdtempSync(join(tmpdir(), 'fogcast-sim-'))
const conv = (id, title, turns, ageMin) => {
  const t0 = Date.now() - ageMin * 60e3, rows = []
  turns.forEach(([u, a], i) => { const ts = new Date(t0 + i * 60e3).toISOString(); rows.push({ type: 'user', message: { role: 'user', content: u }, timestamp: ts, sessionId: id }, { type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: a }] }, timestamp: ts, sessionId: id }) })
  if (title) rows.push({ type: 'custom-title', customTitle: title, sessionId: id })
  rows.push({ type: 'last-prompt', lastPrompt: turns[turns.length - 1][0], sessionId: id })
  const f = join(CONVS, `${id}.jsonl`); writeFileSync(f, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  const at = (t0 + turns.length * 60e3) / 1000; utimesSync(f, at, at)
}
conv('5f0c2a71-3b9e-4c1d-9a55-0e1f2a3b4c5d', 'statusline-fix', [['ステータスラインの幅が崩れる不具合を直して', '全角文字の幅を 1 と数えていたのが原因でした。`stringWidth` で数えるようにしています。'], ['狭い端末でも 1 行に収まるか確かめて', '80 桁と 60 桁で確かめました。60 桁では予報の部分を省きます。']], 120)
conv('9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d', '', [['受け皿の再起動で回数が二重になるのを直して', '再接続のときに送り直す分を、受け皿が受け取り済みの番号で間引くようにしました。']], 1440)
// what a skill's or agent's SKILL.md / definition says it is for
const DESC = { 'api-conventions': 'API を設計・変更するときに使う。\nURL の命名、エラーの形、ページングの書き方をまとめている。', reviewer: '変更のレビューを任せるサブエージェント。差分を読み、バグの可能性を挙げる。', dataviz: '表をグラフにするときに使う。' }
// skills and agents: [name, where] — '.claude' is the project's own (listed in コミュ when loaded), anything else is everywhere's (listed when first called)
function terminal(chan, cwd, skills, agents, mcp) {
  const own = ([, src]) => src.startsWith('.claude')
  const t = { chan, out: [], turn: 0, sid: `${chan}-sess`, model: 'claude-opus-5-5', effort: 'xhigh', convs: '' }
  t.push = ev => t.out.push({ t: Date.now(), ...ev })
  t.hello = () => post('/api/mod/hello', {
    chan, mod: '0.5.3', sid: t.sid, cwd, branch: 'main', model: t.model, version: '2.1.291', startedAt: Date.now() - 600e3,
    tdir: t.convs || '', effort: t.effort, models: MODELS, efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'auto'],
    commands: [...BUILTIN.map(([name, description, hint]) => ({ name, description, source: 'builtin', hint })), ...skills.map(([s]) => ({ name: s, description: `${s} の手順`, source: 'user' })), { name: 'fog', description: 'Fogcast', source: 'plugin', plugin: 'fogcast' }],
    loaded: { md: true, memory: [{ path: `${cwd}/CLAUDE.md`, type: 'Project', dt: 2400 }], skills: skills.map(([n, src]) => ({ n, src, dt: 160 })), agents: agents.map(([n, src]) => ({ n, src, dt: 70 })), mcp, mods: ['fogcast'], totalSkills: skills.length, includedSkills: skills.length, window: 200000, autoCompactAt: 167000 },
    breakdown: [{ n: 'System prompt', v: 3100 }, { n: 'System tools', v: 14200 }, { n: 'MCP tools', v: 6200 }, { n: 'Memory files', v: 2400 }, { n: 'Skills', v: 640 }, { n: 'Messages', v: 1200 }],
    links: [...skills.filter(own).map(([n, src]) => ({ id: `skill:${n}`, kind: 'skill', label: n, src, dt: 160, desc: DESC[n] })), ...agents.filter(own).map(([n, src]) => ({ id: `agent:${n}`, kind: 'agent', label: n, src, dt: 70, desc: DESC[n] })), ...mcp.map(n => ({ id: `mcp:${n}`, kind: 'mcp', label: n, src: 'MCP', dt: 3100 }))],
  })
  t.sync = async () => {
    if (t.gone) return                       // a terminal that has exited reports nothing more
    const events = t.out.splice(0)
    const r = await post('/api/mod/sync', { chan, events })
    if (r.ok === false) { await t.hello(); return }
    if ((r.pair?.code ?? null) !== (t.pair ?? null)) { t.pair = r.pair?.code ?? null; log({ chan, pair: r.pair }) }
    for (const c of r.commands || []) { log({ chan, command: c }); if (c.type === 'prompt') t.queue = (t.queue || []).concat(c); else if (c.type === 'answer') t.answered = c; else t.perform(c) }
  }
  // the pickers and commands, as Claude Code answers them (the mod's rows for them)
  t.perform = c => {
    if (c.type === 'model') { const to = MODEL_ID[c.value] || c.value; if (to !== t.model) t.push({ k: 'model', from: t.model, to, src: 'screen' }); t.model = to; t.push({ k: 'models', options: MODELS.options, value: c.value }) }
    else if (c.type === 'effort') { t.effort = c.value; t.push({ k: 'cmd', name: 'effort', args: c.value, via: 'screen', run: c.id, text: `Set effort level to ${c.value} (saved as your default for new sessions)` }); t.push({ k: 'info', effort: c.value }) }
    else if (c.type === 'resume') { const from = t.sid; t.sid = c.sid; t.push({ k: 'resumed', from, sid: c.sid, title: '', tp: join(t.convs, `${c.sid}.jsonl`), source: 'resume' }) }
    else if (c.type === 'command') t.push({ k: 'cmd', name: c.name, args: c.args || '', via: 'screen', run: c.id, text: c.name === 'context' ? '## Context Usage\n\n| Category | Tokens | Percentage |\n|---|---|---|\n| System prompt | 3.1k | 1.6% |\n| Messages | 38.0k | 19.0% |' : '' })
  }
  return t
}
const tool = (id, name, input, link, extra = {}) => ({ k: 'tool', id, name, input, link: link || { id: name, kind: 'tool', label: name, src: '組み込み' }, ...extra })
const measure = (tokens, five, seven, usd) => ({ k: 'measure', ctx: { tokens, window: 200000, percent: Math.round(tokens / 2000) }, usd,
  limits: [{ kind: 'five_hour', pc: five, resetsAt: new Date(Date.now() + 2.3 * 3600e3).toISOString() }, { kind: 'seven_day', pc: seven, resetsAt: new Date(Date.now() + 3.4 * 86400e3).toISOString() }] })

const BUILT_IN = [['general-purpose', '組み込み'], ['Explore', '組み込み'], ['Plan', '組み込み']]
const MINE = [['dataviz', '~/.claude'], ['release-notes', '~/.claude']]
const api = terminal('sim-shop-api', `${HOME}/dev/shop-api`, [['api-conventions', '.claude'], ['db-migration', '.claude'], ['sql-style', '.claude'], ...MINE], [...BUILT_IN, ['reviewer', '.claude']], ['github', 'postgres'])
api.convs = CONVS
const docs = terminal('sim-docs-site', `${HOME}/dev/docs-site`, MINE, BUILT_IN, [])
await api.hello(); await docs.hello()
setInterval(() => { api.sync().catch(() => {}); docs.sync().catch(() => {}) }, 500)

// ch.1: a turn with a few calls, one of which waits for the person
api.push(measure(41000, 38, 61, 2.4))
await sleep(600)
api.push({ k: 'turn', id: 'turn-1', text: '注文 API のタイムアウトを直して、テストまで通して' })
await sleep(500)
api.push(tool('t1', 'Read', 'src/orders/client.ts')); await sleep(400); api.push({ k: 'toolEnd', id: 't1', out: '210 行' })
api.push(tool('t2', 'Grep', '"timeout" in src', null, {})); await sleep(300); api.push({ k: 'toolEnd', id: 't2', out: '6 件' })
api.push({ k: 'user', text: 'テストは orders だけで大丈夫です', mid: true })      // typed at the terminal while the turn ran
api.push(tool('t3', 'Skill', 'api-conventions', { id: 'skill:api-conventions', kind: 'skill', label: 'api-conventions', src: '.claude', dt: 160 })); await sleep(200); api.push({ k: 'toolEnd', id: 't3', out: '読み込み' })
// one of everywhere's skills, called for the first time: it joins コミュ now
api.push(tool('t3b', 'Skill', 'dataviz', { id: 'skill:dataviz', kind: 'skill', label: 'dataviz', src: '~/.claude', dt: 160, desc: DESC.dataviz })); await sleep(200); api.push({ k: 'toolEnd', id: 't3b', out: '読み込み' })
api.push(tool('t4', 'Edit', 'src/orders/client.ts', null, { file: { path: 'src/orders/client.ts', add: 12, del: 3 } })); await sleep(400); api.push({ k: 'toolEnd', id: 't4', out: '保存' })
api.push({ k: 'say', text: '待ち時間を **定数** にまとめ、`ORDER_TIMEOUT_MS` を 30 秒にしました。テストを実行します。' })
api.push(tool('t5', 'Bash', 'npm test -- orders'))
api.push({ k: 'wait', id: 't5', name: 'Bash', input: 'npm test -- orders' })
await sleep(2500)
api.push({ k: 'run', id: 't5' }); await sleep(800); api.push({ k: 'toolEnd', id: 't5', out: '22 passed' })
api.push({ k: 'say', text: 'テスト 22 件が通りました。' })
api.push(measure(52500, 41, 62, 2.61))
api.push({ k: 'turnEnd', id: 'turn-1', ms: 9400, usage: { in: 4200, out: 900, cw: 1200, cr: 38000 } })
api.push({ k: 'suggest', text: 'orders 以外のテストも実行して' })       // Claude Code's guess at the next prompt
log({ sim: 'turn-1 done' })

// ch.2 stays idle; ch.1 answers what the screen sends and asks for approval when told to
let asked = 0
for (;;) {
  await sleep(300)
  if (api.queue?.length) {
    const c = api.queue.shift(), text = c.text, n = ++api.turn + 1, id = `turn-${n}`
    await sleep(1200)                                                      // a terminal takes it up on its next round
    api.push({ k: 'suggest', text: '' }); api.push({ k: 'turn', id, text, via: 'screen', cid: c.id }); await sleep(500)
    api.push(tool(`r${n}`, 'Read', 'README.md')); await sleep(300); api.push({ k: 'toolEnd', id: `r${n}`, out: '84 行' })
    api.push({ k: 'say', text: `「${text}」を受け取りました。` }); api.push({ k: 'turnEnd', id, ms: 1800, usage: { in: 800, out: 120, cw: 0, cr: 40000 } })
    api.push({ k: 'suggest', text: '変更をコミットして' })
  }
  const what = CTL && existsSync(CTL) ? readFileSync(CTL, 'utf8').trim() : ''
  if (what === 'end') { rmSync(CTL); docs.push({ k: 'end', reason: 'prompt_input_exit', resume: 'sim-docs-site-sess' }); await docs.sync(); docs.gone = true; log({ sim: 'docs ended' }) }
  if (what === 'question') {
    rmSync(CTL)
    const id = `q-${++asked}`, qs = [{ q: 'リリースノートはどこに書きますか？', h: '書く場所', multi: false, opts: [{ l: 'CHANGELOG.md', d: 'リポジトリの変更履歴に足す' }, { l: 'GitHub Releases', d: 'タグのリリースノートに書く' }] }]
    api.push({ k: 'turn', id: `turn-q${asked}`, text: 'リリースの準備をして' })
    api.push(tool(id, 'AskUserQuestion', qs[0].q)); api.push({ k: 'question', id, qs })
    api.answered = null
    while (!api.answered || api.answered.qid !== id) await sleep(200)
    const a = api.answered.answers[0], label = a.text || qs[0].opts[a.pick[0]].l
    log({ question: id, answer: label })
    api.push({ k: 'questionEnd', id, by: 'screen', answers: { [qs[0].q]: label } }); api.push({ k: 'toolEnd', id, out: '回答' })
    api.push({ k: 'say', text: `${label} に書きます。` }); api.push({ k: 'turnEnd', id: `turn-q${asked}`, ms: 3000 })
  }
  if (what === 'ask') {
    rmSync(CTL)
    const id = `ask-${++asked}`, n = api.turn + 2 + asked
    api.push({ k: 'turn', id: `turn-a${asked}`, text: 'リリース用にビルドして push して' })
    api.push(tool(id, 'Bash', 'git push origin main')); api.push({ k: 'wait', id, name: 'Bash', input: 'git push origin main' })
    await api.sync()
    const r = await post('/api/mod/ask', { chan: api.chan, id, tool: 'Bash', input: 'git push origin main' })
    log({ ask: id, mode: r.mode })
    if (r.mode === 'screen') {
      let d = null
      while (!d) { const w = await post('/api/mod/ask/wait', { id }); d = w.decision }
      log({ ask: id, decision: d })
      if (d === 'allow') { api.push({ k: 'run', id, how: 'screen' }); api.push({ k: 'toolEnd', id, out: 'pushed' }) } else api.push({ k: 'toolEnd', id, err: true, out: '拒否' })
      api.push({ k: 'turnEnd', id: `turn-a${asked}`, ms: 4000 })
    }
    void n
  }
}
