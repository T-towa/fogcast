// Fogcast (霧読み): reports this terminal's conversation, tool calls and usage to the
// localhost hub, and carries out what the Fogcast screen asks of this terminal.
//
// Nothing here adds to the model's context: the hooks watch and pass everything on as
// it was. The one exception is /fog's one-line answer, which says where the screen is.
import type { Register } from 'claude-code'
import { linkFor, verb, summarize, outline, fileChange, todosOf, textOf, srcLabel, statusLine, older, isLocalSrc, midTurnText, clip, str, keepText, questionsOf, answersFor, type Reading } from './shape'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/** Keep in step with .claude-plugin/plugin.json and hub/hub.mjs (a test checks). */
export const VERSION = '0.4.0'
const DEFAULT_PORT = 4317
/** Claude Code drops a toast asked to stay longer than this (0.1.0 lost its pairing notice that way). */
const TOAST_MAX = 60000
const SYNC_MS = 700
const RELOADS = new Set(['reload-skills', 'reload-plugins', 'mcp', 'plugin', 'agents', 'skills', 'memory', 'add-dir'])
const SKIP_CMDS = new Set(['compact', 'clear', 'exit', 'quit', 'fog'])

function rid(): string {
  try { const b = new Uint8Array(8); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, '0')).join('') }
  catch { return (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 16) }
}
/** This terminal, for as long as the module is loaded: kept across /clear and resumes. */
const CHAN = rid()

const st = {
  on: false,
  port: DEFAULT_PORT, base: `http://127.0.0.1:${DEFAULT_PORT}`, dir: '', token: '',
  ready: false, lastTry: 0, startedHubAt: 0, warned: new Set<string>(),
  num: 0, approvals: false, forecast: null as Any,
  measure: null as Any, limits: [] as Reading[], ctx: undefined as number | undefined, usd: undefined as number | undefined,
  sid: '', cwd: '', model: '', branch: '', startedAt: 0,
  busy: false, ticks: 0, lastLine: '', turnsDone: 0,
  turnId: '', turnText: '', turnHasOutput: false,
  midTyped: [] as string[],   // typed at the terminal while a turn ran, until it reaches the model
  lastCmd: null as null | { name: string; args: string; t: number; screen?: boolean },
  afterTurn: [] as Array<() => void>,
  tools: new Map<string, { name: string; input: string; agent?: string; waiting?: boolean }>(),
  ceil: new Set<string>(),
  agents: new Map<string, string>(),
  recentSkill: null as null | { name: string; t: number },
  mode: '',
  band: null as null | { id: string; tool: string; input: string; until: number },
  /** the code a browser must type to approve from the screen; shown above the prompt and in the status line, never to the model */
  pair: null as null | { code: string; until: number },
  replacedAt: 0,
  /** where each loaded skill and agent comes from, and what it costs each request: given to its コミュ card when it is first used */
  srcOf: new Map<string, { src: string; dt?: number; desc?: string }>(),
  /** the address with its key, drawn under /fog's row when no browser could be opened (the stored row, which the model reads, never has it) */
  fogShow: '',
  /** prompts the screen sent, until their turn starts: the hub's id rides along so the screen can swap its pending bubble for the turn */
  submitted: [] as Array<{ text: string; cid: string }>,
  /** each command's argument hint (`[model]`), as the engine lists it for the typeahead */
  hints: new Map<string, string>(),
  /** what each agent type is for (its definition's description), as the engine offers it to the model */
  agentDesc: new Map<string, string>(),
  /** the prompt box's dim suggestion for the next prompt (Tab takes it), while it stands */
  suggest: '',
  /** questions Claude is asking (AskUserQuestion): an answer from the screen settles the one waiting here */
  qWait: new Map<string, (sent: unknown) => void>(),
}
const outbox: Any[] = []
const ring: Any[] = []     // what is replayed if the hub restarts

function push(ev: Any) {
  if (!st.on) return
  ev.t = ev.t ?? Date.now()
  outbox.push(ev)
  if (outbox.length > 2000) outbox.splice(0, outbox.length - 2000)
  if (ev.k !== 'measure' && ev.k !== 'mode' && ev.k !== 'suggest') { ring.push(ev); if (ring.length > 500) ring.splice(0, ring.length - 500) }
}

/* ---------------- the hub ---------------- */
async function get($: Any, path: string): Promise<Any> {
  try { const r = await $.http.fetch(st.base + path); return r.ok ? JSON.parse(r.text || 'null') : null } catch { return null }
}
async function post($: Any, path: string, body: unknown): Promise<Any> {
  if (!st.token) return null
  try {
    const r = await $.http.fetch(st.base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fogcast-token': st.token }, body: JSON.stringify(body) })
    if (r.status === 401) { st.token = ''; st.ready = false; return null }
    if (r.status >= 500) return null
    return JSON.parse(r.text || 'null')
  } catch { return null }
}
function warnOnce($: Any, key: string, text: string) {
  if (st.warned.has(key)) return
  st.warned.add(key)
  try { $.ui.toast(text, { timeoutMs: 15000 }) } catch {}
}
async function paths($: Any) {
  const port = Number(await $.env.get('FOGCAST_PORT')) || DEFAULT_PORT
  st.port = port; st.base = `http://127.0.0.1:${port}`
  const custom = await $.env.get('FOGCAST_HOME')
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
  st.dir = custom || (home ? `${home}/.fogcast` : '')
}
async function readToken($: Any): Promise<string> {
  if (!st.dir) return ''
  try { return String(await $.fs.read(`${st.dir}/token`)).trim() } catch { return '' }
}
/** The hub this mod talks to: same port and home folder, whatever the host's environment says. */
function hubEnv(): Record<string, string> {
  return st.dir ? { FOGCAST_PORT: String(st.port), FOGCAST_HOME: st.dir } : { FOGCAST_PORT: String(st.port) }
}
async function startHub($: Any) {
  st.startedHubAt = Date.now()
  const node = (await $.env.get('FOGCAST_NODE')) || 'node'
  try {
    const r = await $.process.run([node, `${$.plugin.root}/hub/hub.mjs`, '--daemon'], { timeoutMs: 15000, env: hubEnv() })
    if (r.exitCode !== 0) warnOnce($, 'start', `Fogcast: 受け皿を起動できませんでした（${clip(r.stderr || `終了コード ${r.exitCode}`, 120)}）`)
  } catch {
    warnOnce($, 'node', 'Fogcast: Node.js が見つからないため、受け皿（localhost の画面）を起動できませんでした。Node.js 18 以上を入れるか、環境変数 FOGCAST_NODE に node のパスを指定してください。')
  }
}
/** After an update, a hub of an older version may still be running: it is stopped once, and this mod starts its own. */
async function stopHub($: Any) {
  const node = (await $.env.get('FOGCAST_NODE')) || 'node'
  try { await $.process.run([node, `${$.plugin.root}/hub/hub.mjs`, '--stop'], { timeoutMs: 10000, env: hubEnv() }) } catch {}
}
async function branch($: Any): Promise<string> {
  try { const r = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 4000 }); return r.exitCode === 0 ? r.stdout.trim() : '' } catch { return '' }
}
/**
 * Skills only the person can run (`disable-model-invocation: true`): Claude is never told of them, so they
 * cost nothing each turn and /context leaves them out. The command list has them, and the project's own
 * folders say which are its; the rest are everywhere's (~/.claude).
 */
async function manualSkills($: Any, shown: Set<string>, list: Any[]): Promise<Any[]> {
  try {
    const own = new Set<string>()
    try { for (const e of await $.fs.list('.claude/skills')) if (e.kind !== 'file') own.add(e.name) } catch {}
    try { for (const e of await $.fs.list('.claude/commands')) if (e.kind === 'file' && e.name.endsWith('.md')) own.add(e.name.slice(0, -3)) } catch {}
    return list.filter((c: Any) => c.source === 'user' && !shown.has(c.name))
      .map((c: Any) => ({ n: c.name, src: own.has(c.name) ? '.claude' : '~/.claude', dt: 0, manual: true }))
  } catch { return [] }
}
/**
 * Each skill's description (its SKILL.md `description`), from the command list: read here, never sent to the
 * model by Fogcast. A name listed twice (a skill of the person's and a built-in) takes the one of its own source.
 */
function descOf(list: Any[]): (name: string, builtin?: boolean) => string {
  const own = new Map<string, string>(), core = new Map<string, string>()
  for (const c of list) if (c && typeof c.name === 'string' && typeof c.description === 'string' && c.description.trim()) (c.source === 'builtin' ? core : own).set(c.name, c.description)
  return (name, builtin) => keepText((builtin ? core.get(name) ?? own.get(name) : own.get(name) ?? core.get(name)) ?? '', 1500)
}
async function commandList($: Any): Promise<Any[]> { try { const l = await $.command.list(); return Array.isArray(l) ? l : [] } catch { return [] } }
/** What the session loaded at start, as /context counts it (estimated locally: no request is sent). */
async function loaded($: Any, list: Any[]): Promise<Any> {
  try {
    const u = await $.session.usage({ breakdown: 'summary' })
    st.startedAt = u.startedAt
    const b = u.context.breakdown
    if (!b) return {}
    const desc = descOf(list)
    const listed = (b.skills?.skillFrontmatter ?? []).map((s: Any) => ({ n: s.name, src: srcLabel(s.source, s.pluginName), dt: s.tokens, desc: desc(s.name, /built-?in|bundled/.test(String(s.source))) }))
    const skills = [...listed, ...(await manualSkills($, new Set(listed.map((s: Any) => s.n)), list)).map((s: Any) => ({ ...s, desc: desc(s.n) }))]
    const servers = new Map<string, number>()
    for (const t of b.mcpTools ?? []) servers.set(t.serverName, (servers.get(t.serverName) ?? 0) + (t.isLoaded ? t.tokens : 0))
    const agents = (b.agents ?? []).map((a: Any) => ({ n: a.agentType, src: srcLabel(a.source), dt: a.tokens, desc: st.agentDesc.get(a.agentType) ?? '' }))
    const memory = (b.memoryFiles ?? []).map((m: Any) => ({ path: m.path, type: m.type, dt: m.tokens }))
    st.srcOf = new Map([...skills.map((s: Any) => [`skill:${s.n}`, { src: s.src, dt: s.dt, desc: s.desc }]), ...agents.map((a: Any) => [`agent:${a.n}`, { src: a.src, dt: a.dt, desc: a.desc }])] as Any)
    return {
      loaded: {
        md: memory.length > 0, memory, skills: skills.map(({ desc: _d, ...s }: Any) => s), agents: agents.map(({ desc: _d, ...a }: Any) => a), mcp: [...servers.keys()], mods: ['fogcast'],
        totalSkills: b.skills?.totalSkills ?? skills.length, includedSkills: b.skills?.includedSkills ?? skills.length,
        window: b.rawMaxTokens, autoCompactAt: b.autoCompactThreshold ?? null,
      },
      breakdown: (b.categories ?? []).filter((c: Any) => c.kind === 'used' && c.tokens > 0).map((c: Any) => ({ n: c.name, v: c.tokens })),
      // コミュ: a project's own skills and agents join when loaded; everywhere's join when first called
      links: [
        ...skills.filter((s: Any) => isLocalSrc(s.src)).map((s: Any) => ({ id: `skill:${s.n}`, kind: 'skill', label: s.n, src: s.src, dt: s.dt, desc: s.desc || undefined })),
        ...agents.filter((a: Any) => isLocalSrc(a.src)).map((a: Any) => ({ id: `agent:${a.n}`, kind: 'agent', label: a.n, src: a.src, dt: a.dt, desc: a.desc || undefined })),
        ...[...servers].map(([n, dt]) => ({ id: `mcp:${n}`, kind: 'mcp', label: n, src: 'MCP', dt })),
      ],
    }
  } catch { return {} }
}
/** The commands for the screen's "/" list: one line each, with the hint the terminal draws after the name. */
function commands(list: Any[]): Any[] {
  return list.map((c: Any) => ({ name: c.name, description: clip(c.description || '', 160), source: c.source, plugin: c.plugin, hint: st.hints.get(c.name) || undefined }))
}
async function hello($: Any) {
  const list = await commandList($)
  const [sid, cwd, model, version, info, br] = await Promise.all([
    $.session.id().catch(() => ''), $.session.cwd().catch(() => st.cwd), $.session.model().catch(() => ''),
    $.session.version().catch(() => null), loaded($, list), branch($),
  ])
  const cmds = commands(list)
  st.sid = sid; st.cwd = cwd; st.model = model; st.branch = br
  return { chan: CHAN, mod: VERSION, sid, cwd, branch: br, model, version: version?.version ?? '', startedAt: st.startedAt || Date.now(), commands: cmds, ...info, replay: ring }
}
async function connect($: Any): Promise<boolean> {
  st.lastTry = Date.now()
  const h = await get($, '/api/health')
  if (!h) { if (Date.now() - st.startedHubAt > 20000) await startHub($); return false }
  if (h.app !== 'fogcast') { warnOnce($, 'port', `Fogcast: ポート ${st.port} は別のプログラムが使っています。環境変数 FOGCAST_PORT で別の番号にできます。`); return false }
  if (older(h.version, VERSION) && Date.now() - st.replacedAt > 60000) {
    // an update left the older hub running: stop it, give it a moment to let go of the port, start this version's
    st.replacedAt = Date.now()
    await stopHub($)
    await $.clock.sleep(800)
    await startHub($)
    return false
  }
  if (!st.token) st.token = await readToken($)
  if (!st.token) return false
  const r = await post($, '/api/mod/hello', await hello($))
  if (!r || !r.ok) return false
  st.ready = true; st.num = r.num; st.approvals = !!r.approvals?.on; st.forecast = r.forecast ?? null
  outbox.length = 0                     // the replay carried them
  if (st.measure) push({ ...st.measure, t: Date.now() })
  applyPair($, r.pair)
  line($)
  return true
}
/** The hub hands every terminal the code while a browser is being paired, and null once it is used, taken back or out of time. */
function applyPair($: Any, p: Any) {
  const next = p && typeof p.code === 'string' && Number(p.exp) > Date.now() ? { code: p.code, until: Number(p.exp) } : null
  if ((next?.code ?? null) === (st.pair?.code ?? null)) { if (next && st.pair) st.pair.until = next.until; return }
  st.pair = next
  // the notice only points at the band: a code in a notice could outlive the code itself
  if (next) { try { $.ui.toast('Fogcast: ブラウザ承認の合言葉を、入力欄のすぐ上に出しました', { timeoutMs: 12000 }) } catch {} }
  try { $.ui.invalidate('ui.render') } catch {}
  line($)
}
function pairLeft(): string {
  const s = st.pair ? Math.max(0, Math.round((st.pair.until - Date.now()) / 1000)) : 0
  return s > 60 ? `あと約 ${Math.ceil(s / 60)} 分` : `あと ${s} 秒`
}
async function reload($: Any) {
  const list = await commandList($)
  push({ k: 'loaded', ...await loaded($, list), commands: commands(list) })
}
function line($: Any) {
  if (!st.on) return
  const pair = st.pair && st.pair.until > Date.now() ? st.pair.code : undefined
  const text = statusLine({ num: st.num, ready: st.ready, ctx: st.ctx, limits: st.limits, usd: st.usd, forecast: st.forecast, pair })
  if (text === st.lastLine) return
  st.lastLine = text
  try { $.ui.status(text) } catch {}
}
async function tick($: Any) {
  if (st.busy) return
  st.busy = true
  try {
    st.ticks++
    if (st.pair && st.pair.until <= Date.now()) applyPair($, null)        // out of time, whether or not the hub said so yet
    if (!st.ready) { if (Date.now() - st.lastTry > 2000) { await connect($); line($) } return }
    if (st.ticks % 8 === 0) {
      const [sid, model] = await Promise.all([$.session.id().catch(() => st.sid), $.session.model().catch(() => st.model)])
      if (sid !== st.sid || model !== st.model) { st.sid = sid; st.model = model; push({ k: 'info', sid, model }) }
    }
    if ((st.band || st.pair) && st.ticks % 2 === 0) $.ui.invalidate('ui.render')    // the band's countdown
    if (!outbox.length && !st.turnId && st.ticks % 3 !== 0) return       // quiet: every ~2 s is enough
    const events = outbox.splice(0, 400)
    const r = await post($, '/api/mod/sync', { chan: CHAN, events })
    if (!r) { outbox.unshift(...events); st.ready = false; line($); return }
    if (r.ok === false) { st.ready = false; return }   // the hub restarted: say hello again, with the replay
    st.num = r.num ?? st.num; st.approvals = !!r.approvals?.on; st.forecast = r.forecast ?? null
    applyPair($, r.pair)
    for (const c of r.commands ?? []) perform($, c)
    line($)
  } catch {} finally { st.busy = false }
}

/* ---------------- what the screen asks of this terminal ---------------- */
function perform($: Any, c: Any) {
  const fail = (err: unknown) => push({ k: 'did', cid: c.id, what: c.type, ok: false, error: clip(String((err as Any)?.message ?? err), 200) })
  try {
    if (c.type === 'prompt') {
      st.submitted.push({ text: String(c.text), cid: String(c.id) }); if (st.submitted.length > 8) st.submitted.shift()
      void $.prompt.submit({ text: String(c.text), asUser: true }).catch(fail)        // starts once the session is idle
    } else if (c.type === 'answer') {
      st.qWait.get(String(c.qid))?.(c.answers)                                          // a question still open here takes it
    } else if (c.type === 'command') {
      st.lastCmd = { name: String(c.name), args: String(c.args || ''), t: Date.now(), screen: true }
      void $.command.run({ command: String(c.name), args: String(c.args || '') }).catch(fail)
    } else if (c.type === 'stop') {
      if (st.turnId) void $.turn.abort({ turnId: st.turnId }).catch(fail)
    } else if (c.type === 'compact') {
      const go = () => { void $.session.compact(c.instructions ? { instructions: String(c.instructions) } : undefined).catch(fail) }
      if (st.turnId) st.afterTurn.push(go); else go()
    } else if (c.type === 'toast') {
      $.ui.toast(String(c.text || ''), { timeoutMs: Math.min(TOAST_MAX, Math.max(1, Math.round(Number(c.timeoutMs) || 15000))) })
    }
  } catch (err) { fail(err) }
}

/* ---------------- approving from the screen (only when it was turned on and paired there) ---------------- */
async function waitDecision($: Any, id: string, signal?: AbortSignal): Promise<string> {
  const until = Date.now() + 125000
  while (Date.now() < until) {
    if (signal?.aborted) { void post($, '/api/mod/ask/answer', { id, decision: 'cancel' }); return 'cancel' }
    const t0 = Date.now()
    const r = await post($, '/api/mod/ask/wait', { id })     // the hub holds this up to 25 s
    if (!r) return 'terminal'
    if (r.decision) return r.decision
    if (Date.now() - t0 < 1000) await $.clock.sleep(1000)     // a hub that answers at once is not holding: do not spin
  }
  return 'terminal'
}

/* ---------------- a question Claude asks (AskUserQuestion), answerable from the screen ---------------- */
/**
 * The terminal's own dialog opens as usual (next). The screen gets the question too; whichever answers first
 * is the answer. One from the screen is handed to Claude in the tool's own terms, and returning it while the
 * dialog is still open closes the dialog.
 */
async function question($: Any, e: Any, next: Any, id: string, args: Any): Promise<Any> {
  const qs = questionsOf(args)
  if (!st.on || !qs.length) return next(e)
  push({ k: 'question', id, qs })
  const inTerminal = next(e)
  let settle: (v: Any) => void = () => {}
  const fromScreen = new Promise<Any>(res => { settle = res })
  st.qWait.set(id, sent => { const answers = answersFor(args, sent); if (answers) settle(answers) })
  try {
    const first = await Promise.race([inTerminal.then((r: Any) => ({ r })), fromScreen.then(answers => ({ answers }))])
    if ('answers' in first) {
      inTerminal.catch(() => {})                  // the dialog, closed by this answer, settles as refused: not Claude's answer
      push({ k: 'questionEnd', id, by: 'screen', answers: first.answers })
      return { result: { questions: e.questions, answers: first.answers } }
    }
    const a = first.r?.result?.answers
    push({ k: 'questionEnd', id, by: 'terminal', answers: a && typeof a === 'object' && !first.r?.isError ? a : undefined, err: !!(first.r?.isError || first.r?.deny) })
    return first.r
  } finally { st.qWait.delete(id) }
}

/* ---------------- /fog ---------------- */
/** Under WSL the browser is Windows': this terminal opens it through interop itself. The hub may have been
 *  started from a terminal that has since closed, and Windows programs cannot be run from a session that is gone. */
async function openFromWsl($: Any, url: string): Promise<boolean> {
  if (!((await $.env.get('WSL_DISTRO_NAME')) || (await $.env.get('WSL_INTEROP')))) return false
  for (const argv of [['rundll32.exe', 'url.dll,FileProtocolHandler', url], ['/mnt/c/Windows/System32/rundll32.exe', 'url.dll,FileProtocolHandler', url], ['wslview', url]]) {
    try { if ((await $.process.run(argv, { timeoutMs: 8000 })).exitCode === 0) return true } catch {}
  }
  return false
}
async function fog($: Any) {
  if (!st.ready) await connect($)
  if (!st.ready) return { text: '受け皿にまだ接続できていません。数秒待ってから、もう一度 /fog を実行してください。' }
  const url = `${st.base}/#k=${st.token}`
  const opened = (await openFromWsl($, url)) || !!(await post($, '/api/mod/open', {}))?.opened
  // the address with its key goes to the person only: drawn under this row (never stored) and pointed at by a toast
  st.fogShow = url
  try { $.ui.toast(opened ? 'Fogcast: 画面をブラウザで開きました。開かないときは /fog の下の URL から' : 'Fogcast: ブラウザを開けませんでした。/fog の下の URL を開いてください', { timeoutMs: TOAST_MAX }) } catch {}
  // the one link to press is the keyed one drawn below, on a line of its own (a terminal takes punctuation
  // that touches a URL as part of it); the line the model reads has none
  return { text: opened ? 'Fogcast の画面をブラウザで開きました。開いていなければ、この下の URL を開いてください。' : 'ブラウザを開けませんでした。この下の URL を開いてください。' }
}

export const register: Register = (on) => {
  on('session.start', async ($: Any, e: Any, next: Any) => {
    const r = await next(e)
    try {
      st.on = e.isInteractive === true || (await $.env.get('FOGCAST_HEADLESS')) === '1'
      if (!st.on) return r
      st.cwd = e.cwd
      await paths($)
      await $.command.register({ name: 'fog', description: 'Fogcast の画面（全ターミナルの会話と使用量）をブラウザで開く' }).catch(() => {})
      $.clock.every(SYNC_MS, () => tick($))
      line($)
    } catch {}
    return r
  })

  on('session.measure', async ($: Any, e: Any, next: Any) => {
    try {
      st.ctx = e.context.percent; st.limits = e.rateLimits ?? []; st.usd = e.cost?.usd
      st.measure = {
        k: 'measure', ctx: { tokens: e.context.tokens ?? 0, window: e.context.window, percent: e.context.percent ?? 0 },
        limits: st.limits.map((w: Reading) => ({ kind: w.kind, pc: w.percentUsed, resetsAt: w.resetsAt })), usd: e.cost?.usd,
      }
      push({ ...st.measure })
      line($)
    } catch {}
    return next(e)
  })

  // typed over a running turn: Claude Code hands it to the model inside that turn at its next step (with no step left, it starts the next turn)
  on('prompt.submit', async ($: Any, e: Any, next: Any) => {
    const r = await next(e)
    try {
      const who = e.origin?.kind
      if (st.on && e.turnId && (who === 'composer' || who === 'bridge') && typeof e.text === 'string' && e.text.trim()) {
        st.midTyped.push(e.text.trim()); if (st.midTyped.length > 5) st.midTyped.shift()
      }
    } catch {}
    return r
  })

  on('turn.start', async ($: Any, e: Any, next: Any) => {
    try {
      st.turnId = e.turnId; st.turnText = e.text || ''; st.turnHasOutput = false
      { const i = st.midTyped.indexOf(String(e.text || '').trim()); if (i >= 0) st.midTyped.splice(i, 1) }   // typed too late for the last one: a turn of its own
      if (st.suggest) { st.suggest = ''; push({ k: 'suggest', text: '' }) }
      const lc = st.lastCmd
      const text = lc && Date.now() - lc.t < 4000 ? `/${lc.name}${lc.args ? ' ' + lc.args : ''}` : e.text
      const i = st.submitted.findIndex(x => x.text === e.text)
      const via = i >= 0 || lc?.screen ? 'screen' : undefined
      const cid = i >= 0 ? st.submitted.splice(i, 1)[0]!.cid : undefined
      st.lastCmd = null
      push({ k: 'turn', id: e.turnId, text, via, cid })
    } catch {}
    return next(e)
  })

  on('turn.complete', async ($: Any, e: Any, next: Any) => {
    try {
      if (e.agentId) {
        const id = st.agents.get(e.agentId)
        if (id) { push({ k: 'agentEnd', id, stopped: !!e.isAborted }); st.agents.delete(e.agentId) }
      } else {
        const u = e.usage
        push({ k: 'turnEnd', id: e.turnId, ms: e.durationMs, aborted: !!e.isAborted, reason: e.reason, usage: u ? { in: u.input_tokens, out: u.output_tokens, cw: u.cache_creation_input_tokens, cr: u.cache_read_input_tokens } : undefined })
        st.turnId = ''; st.turnText = ''; st.lastCmd = null; st.tools.clear(); st.ceil.clear()
        for (const f of st.afterTurn.splice(0)) $.clock.after(400, f)
        if (++st.turnsDone % 5 === 0) void reload($)
        void branch($).then(b => { if (b !== st.branch) { st.branch = b; push({ k: 'info', branch: b }) } })
      }
    } catch {}
    return next(e)
  })

  // the model's words and anything typed while it works; everything else passes untouched
  on('session.append', async ($: Any, e: Any, next: Any) => {
    const r = await next(e)
    try {
      if (st.on && !e.agentId) {
        if (e.door === 'response' && e.message?.type === 'assistant') {
          const t = textOf(e.message.content)
          if (t.trim()) { push({ k: 'say', text: t }); st.turnHasOutput = true }
        } else if (e.door === 'delivery' && st.turnId) {
          // what the person typed while the model worked, reaching it inside this turn: shown there, as they typed it
          const t = midTurnText(e.message, e.origin?.kind, st.midTyped)
          if (t) push({ k: 'user', text: t, mid: true })
        } else if (e.door === 'prompt' && e.message?.role === 'user' && !e.message.isMeta && st.turnId && st.turnHasOutput) {
          const t = textOf(e.message.content).trim()
          if (t && t !== st.turnText.trim()) push({ k: 'user', text: t, mid: true })
        }
      }
    } catch {}
    return r
  })

  on('tool.call', async ($: Any, e: Any, next: Any) => {
    if (!st.on) return next(e)
    const id: string = e.tool_use_id, name = String(e.tool), agent: string | undefined = e.agentId
    const { tool: _t, tool_use_id: _i, agentId: _a, ...args } = e
    try {
      const link = linkFor(name, args)
      const known = st.srcOf.get(link.id); if (known) { link.src = link.src || known.src; if (known.dt != null) link.dt = known.dt; if (known.desc) link.desc = known.desc }
      if (link.kind === 'agent' && !link.desc && st.agentDesc.has(link.label)) link.desc = st.agentDesc.get(link.label)
      const ev: Any = { k: 'tool', id, name: verb(name), input: summarize(name, args, st.cwd), link, agent }
      const fc = fileChange(name, args, st.cwd); if (fc) ev.file = fc
      const todos = todosOf(name, args); if (todos) ev.todos = todos
      if (name === 'TaskUpdate') ev.task = { op: 'update', id: String(args.taskId ?? ''), st: str(args.status), t: str(args.subject) }
      push(ev)
      st.tools.set(id, { name, input: ev.input, agent })
      if (!agent) st.turnHasOutput = true
      if (name === 'Skill') st.recentSkill = { name: link.label, t: Date.now() }
    } catch {}
    let r: Any
    try { r = name === 'AskUserQuestion' && !agent ? await question($, e, next, id, args) : await next(e) }
    catch (err) { push({ k: 'toolEnd', id, err: true, out: '中断' }); st.tools.delete(id); throw err }
    try {
      st.tools.delete(id); st.ceil.delete(id)
      const end: Any = { k: 'toolEnd', id, err: !!(r && (r.deny || r.isError)), out: outline(name, r) }
      if (name === 'TaskCreate' && !end.err) { const m = /#(\d+)/.exec(str(r?.text)) ?? /\b(\d+)\b/.exec(str(r?.text)); end.task = { op: 'create', id: m ? m[1] : id, t: clip(str(args.subject) || str(args.description), 200) } }
      push(end)
    } catch {}
    return r
  })

  // an organization that requires the dialog for a tool keeps it: those calls are never offered to the screen
  on('tool.check', async ($: Any, e: Any, next: Any) => {
    const v = await next(e)
    try { if (e.tool_use_id && (v?.ceiling || e.ceiling)) st.ceil.add(e.tool_use_id) } catch {}
    return v
  })

  // the moment a permission dialog would open
  on('classic.PermissionRequest', async ($: Any, e: Any, next: Any) => {
    const r = await next(e)
    if (!st.on || r?.decision || e.tool_name === 'AskUserQuestion') return r      // a question is answered, not approved: see question()
    try {
      const name = String(e.tool_name)
      let id = ''
      const running = [...st.tools].reverse()
      for (const [tid, t] of running) if (t.name === name && !t.waiting && (t.agent ?? '') === (e.agent_id ?? '')) { id = tid; break }
      if (!id) for (const [tid, t] of running) if (t.name === name && !t.waiting) { id = tid; break }
      const input = summarize(name, (e.tool_input ?? {}) as Any, st.cwd)
      if (id) st.tools.get(id)!.waiting = true
      push({ k: 'wait', id: id || `perm-${Date.now()}`, name: verb(name), input })
      if (!st.ready || !st.approvals || !id || st.ceil.has(id)) return r
      const ask = await post($, '/api/mod/ask', { chan: CHAN, id, tool: verb(name), input })
      if (ask?.mode !== 'screen') return r
      st.band = { id, tool: verb(name), input, until: ask.exp || Date.now() + 120000 }
      $.ui.invalidate('ui.render')
      const decision = await waitDecision($, id, next.signal)
      st.band = null; $.ui.invalidate('ui.render')
      if (decision === 'allow') { push({ k: 'run', id, how: 'screen' }); return { decision: { behavior: 'allow' } } }
      if (decision === 'deny') return { decision: { behavior: 'deny', message: 'Fogcast の画面で拒否されました。' } }
    } catch { st.band = null }
    return r
  })

  on('agent.spawn', async ($: Any, e: Any, next: Any) => {
    const r = await next(e)
    try { if (st.on && r?.agentId) { st.agents.set(r.agentId, e.tool_use_id); push({ k: 'agent', id: e.tool_use_id, type: e.subagentType, desc: clip(e.description || '', 160) }) } } catch {}
    return r
  })

  on('skill.prompt', async ($: Any, e: Any, next: Any) => {
    try {
      const rs = st.recentSkill
      const known = st.srcOf.get(`skill:${e.skill}`)
      if (!(rs && rs.name === e.skill && Date.now() - rs.t < 15000)) push({ k: 'skill', name: e.skill, link: { id: `skill:${e.skill}`, kind: 'skill', label: e.skill, src: known?.src, dt: known?.dt, desc: known?.desc || undefined } })
      st.recentSkill = null
    } catch {}
    return next(e)
  })

  // what each agent type is for, as the engine offers it to the model before a request: kept for its コミュ card
  on('agent.offer', async ($: Any, e: Any, next: Any) => {
    const r = await next(e)
    try {
      const d = keepText(str(e.description), 1500), id = `agent:${e.agent}`
      if (st.on && d && e.source !== 'built-in' && st.agentDesc.get(e.agent) !== d) {
        st.agentDesc.set(e.agent, d)
        const known = st.srcOf.get(id); if (known) known.desc = d
        push({ k: 'desc', id, desc: d })
      }
    } catch {}
    return r
  })
  // each command's argument hint (`/model [model]`), as the engine lists it for the typeahead at start
  on('command.describe', async ($: Any, e: Any, next: Any) => {
    const r = await next(e)
    try { const h = str(r?.argumentHint) || str(e.argumentHint); if (h) st.hints.set(String(e.command), clip(h, 120)); else st.hints.delete(String(e.command)) } catch {}
    return r
  })
  // the dim guess at the next prompt that Claude Code shows after a turn (Tab takes it): the screen shows it too
  on('prompt.suggest', async ($: Any, e: Any, next: Any) => {
    const r = await next(e)
    try { const t = str(e.text).trim(); if (st.on && r?.isShown && t) { st.suggest = t; push({ k: 'suggest', text: clip(t, 400) }) } } catch {}
    return r
  })
  // typing in the terminal's box (or taking the suggestion there) puts the suggestion away
  on('prompt.edit', async ($: Any, e: Any, next: Any) => {
    if (st.suggest) { st.suggest = ''; push({ k: 'suggest', text: '' }) }
    return next(e)
  })

  on('command.run', { command: 'fog' }, async ($: Any) => fog($))
  on('command.run', async ($: Any, e: Any, next: Any) => {
    if (!st.on || e.command === 'fog') return next(e)
    const screen = !!(st.lastCmd?.screen && st.lastCmd.name === e.command)
    st.lastCmd = { name: e.command, args: e.args || '', t: Date.now(), screen }
    const r = await next(e)
    try {
      if (typeof r?.text === 'string' && !st.turnId) st.lastCmd = null          // it printed: no turn follows
      if (!SKIP_CMDS.has(e.command)) push({ k: 'cmd', name: e.command, args: e.args || '', text: typeof r?.text === 'string' ? r.text.slice(0, 5000) : '', via: screen ? 'screen' : undefined })
      if (RELOADS.has(e.command)) void reload($)
    } catch {}
    return r
  })

  on('session.compact', async ($: Any, e: Any, next: Any) => {
    const r = await next(e)
    try { if (st.on && !e.agentId && e.trigger !== 'precompute' && !r?.skip) push({ k: 'compact', trigger: e.trigger }) } catch {}
    return r
  })

  on('session.end', async ($: Any, e: Any, next: Any) => {
    try {
      if (st.on) {
        if (e.reason === 'clear') { push({ k: 'clear', prev: e.sessionId }); st.turnId = ''; st.tools.clear() }
        else {
          push({ k: 'end', reason: e.reason, resume: e.resume?.id ?? e.sessionId })
          if (st.ready) await post($, '/api/mod/sync', { chan: CHAN, events: outbox.splice(0) })
        }
      }
    } catch {}
    return next(e)
  })

  // what the turn is doing right now, for the screen's status line
  on('ui.render', { component: 'Spinner' }, async ($: Any, e: Any, next: Any) => {
    try { const m = e.props?.mode; if (st.on && m && m !== st.mode) { st.mode = m; push({ k: 'mode', mode: m }) } } catch {}
    return next(e)
  })
  // a call that shows progress has been let through its dialog
  on('ui.render', { component: 'ToolProgress' }, async ($: Any, e: Any, next: Any) => {
    try { const t = st.tools.get(e.props?.tool_use_id); if (t?.waiting) { t.waiting = false; push({ k: 'run', id: e.props.tool_use_id }) } } catch {}
    return next(e)
  })
  // /fog's row, as the person sees it: with the address and its key when no browser could be opened
  on('ui.render', { component: 'CommandOutput', props: { command: 'fog' } }, async ($: Any, e: Any, next: Any) => {
    if (!st.fogShow || e.props?.isErrored) return next(e)
    return next({ ...e, props: { ...e.props, text: `${e.props.text}\n\n鍵つきの URL（この画面にだけ出ています）:\n\n${st.fogShow}` } })
  })

  // above the prompt: the code a browser is being paired with, and an approval the screen holds
  on('ui.render', { component: 'AbovePrompt' }, async ($: Any, e: Any, next: Any) => {
    const b = st.band, p = st.pair && st.pair.until > Date.now() ? st.pair : null
    if ((!b && !p) || e.props?.hasSurvey) return next(e)
    const ui = $.ui.resolve(e) as Any
    const parts: Any[] = []
    if (p) parts.push(pairBand($, ui, p))
    if (b) parts.push(askBand($, ui, b))
    return parts.length === 1 ? parts[0] : h(ui.Box, { flexDirection: 'column' }, ...parts)
  })
}

/** The pairing code, framed in yellow right above the prompt, where the person is already looking. */
function pairBand($: Any, ui: Any, p: { code: string; until: number }) {
  const { Box, Text, Button } = ui
  const cancel = () => {
    st.pair = null; $.ui.invalidate('ui.render'); line($)
    void post($, '/api/mod/pair/cancel', { chan: CHAN, code: p.code })
  }
  return h(Box, { key: 'fogcast-pair', flexDirection: 'column', borderStyle: 'round', borderColor: 'warning', paddingX: 1 },
    h(Box, { flexDirection: 'row', gap: 2 },
      h(Text, { color: 'warning', bold: true }, 'Fogcast  ブラウザ承認の合言葉'),
      h(Text, { color: 'warning', bold: true, inverse: true }, ` ${p.code} `)),
    h(Text, { wrap: 'wrap' }, `ブラウザの Fogcast の画面（設定 → ブラウザから承認）に入力してください。${pairLeft()}で使えなくなります。`),
    h(Box, { flexDirection: 'row', gap: 1 },
      h(Text, { dimColor: true }, '心当たりがなければ'),
      h(Button, { key: 'fogcast-pair-cancel', label: '取り消す', onPress: cancel })))
}

/** While the screen holds an approval, the terminal says so and can take it back. */
function askBand($: Any, ui: Any, b: { id: string; tool: string; input: string; until: number }) {
  const { Box, Text, Button } = ui
  const left = Math.max(0, Math.round((b.until - Date.now()) / 1000))
  return h(Box, { key: 'fogcast-ask', flexDirection: 'column' },
    h(Text, { color: 'yellow', bold: true }, `Fogcast の画面で承認を待っています（あと ${left} 秒でここの確認に切り替わります）`),
    h(Text, { dimColor: true, wrap: 'truncate-end' }, `${b.tool}: ${b.input}`),
    h(Button, { key: 'fogcast-here', hotkey: 't', label: 'ここで確認する', onPress: () => { void post($, '/api/mod/ask/answer', { id: b.id, decision: 'terminal' }) } }))
}
