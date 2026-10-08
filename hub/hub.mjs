#!/usr/bin/env node
/*
 * Fogcast hub: the localhost receiver.
 *
 * The Fogcast mod in each Claude Code terminal reports its conversation, tool
 * calls and usage here, and picks up what the screen asks it to do. The screen
 * itself is served at http://127.0.0.1:4317 (FOGCAST_PORT to change it).
 *
 * Node 18 or newer, no dependencies. Listens on 127.0.0.1 only. Every API call
 * needs the token in ~/.fogcast/token; approving tool calls from the screen
 * additionally needs a pairing code that is only ever shown in a terminal
 * (framed above its prompt and in its status line, never in what the model reads).
 *
 *   node hub.mjs            run in the foreground
 *   node hub.mjs --daemon   start in the background and return (what the mod does)
 */
import http from 'node:http'
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, renameSync, statSync, appendFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

export const VERSION = '0.4.0'
const HERE = dirname(fileURLToPath(import.meta.url))
const ARGS = process.argv.slice(2)
const PORT = Number(process.env.FOGCAST_PORT) || 4317
const DIR = process.env.FOGCAST_HOME || join(homedir(), '.fogcast')
const TOKEN_FILE = join(DIR, 'token'), STATE_FILE = join(DIR, 'state.json'), LOG_FILE = join(DIR, 'hub.log'), PID_FILE = join(DIR, 'hub.pid')
const IDLE_EXIT_MS = Number(process.env.FOGCAST_IDLE_MS) || 20 * 60e3   // quit when nothing has connected for this long
const STALE_MS = 20e3            // a terminal that stops reporting for this long is shown as ended
const KEEP_ENDED_MS = 12 * 3600e3
const ASK_MS = 120e3             // how long an approval waits on the screen before the terminal's own dialog takes over
const PAIR_MS = 5 * 60e3
const EVENTS_KEPT = 600          // per channel, for the screen to replay
const MAX_BODY = 2 * 1024 * 1024

/* ---------------- --stop: end a running hub; --daemon: start a detached copy of this file and return ---------------- */
if (ARGS.includes('--stop')) {
  const home = process.env.FOGCAST_HOME || join(homedir(), '.fogcast')
  try { const pid = Number(readFileSync(join(home, 'hub.pid'), 'utf8')); process.kill(pid, 'SIGTERM'); console.log(`stopped the Fogcast hub (pid ${pid})`) }
  catch { console.log('no Fogcast hub is running') }
  process.exit(0)
}
if (ARGS.includes('--daemon')) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], { detached: true, stdio: 'ignore', env: { ...process.env, FOGCAST_DAEMON: '1' } })
  child.unref()
  process.exit(0)
}
const QUIET = process.env.FOGCAST_DAEMON === '1'

/* ---------------- small helpers ---------------- */
const now = () => Date.now()
const str = (v, max = 400) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
function log(...a) {
  const line = `${new Date().toISOString()} ${a.join(' ')}`
  if (!QUIET) console.log(line)
  try {
    if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > 1024 * 1024) renameSync(LOG_FILE, LOG_FILE + '.1')
    appendFileSync(LOG_FILE, line + '\n')
  } catch {}
}
// Days are counted in the screen's time zone once a screen has said which it is: the hub can run under
// WSL on another clock than the Windows browser, and the calendar and the run of days must agree with it.
let tzFmt = null
function setTz(name) {
  if (typeof name !== 'string' || !name || name.length > 64) return false
  try {
    tzFmt = new Intl.DateTimeFormat('en-US', { timeZone: name, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    return true
  } catch { return false }
}
// the zone's wall clock minus UTC, at t
function zoneOff(t) {
  if (!tzFmt) return -new Date(t).getTimezoneOffset() * 60e3
  const p = {}; for (const x of tzFmt.formatToParts(t)) p[x.type] = x.value
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000
}
function dayKey(t) { const w = new Date(t + zoneOff(t)); return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}-${String(w.getUTCDate()).padStart(2, '0')}` }
function dayStart(t) { const off = zoneOff(t), mid = Math.floor((t + off) / 864e5) * 864e5; return mid - zoneOff(mid - off) }

/* ---------------- token ---------------- */
mkdirSync(DIR, { recursive: true, mode: 0o700 })
function loadToken() {
  try { const t = readFileSync(TOKEN_FILE, 'utf8').trim(); if (/^[0-9a-f]{32,}$/.test(t)) return t } catch {}
  const t = randomBytes(24).toString('hex')
  writeFileSync(TOKEN_FILE, t + '\n', { mode: 0o600 })
  try { chmodSync(TOKEN_FILE, 0o600) } catch {}
  return t
}
const TOKEN = loadToken()
const TOKEN_BUF = Buffer.from(TOKEN)
function tokenOk(v) { const b = Buffer.from(String(v || '')); return b.length === TOKEN_BUF.length && timingSafeEqual(b, TOKEN_BUF) }

/* ---------------- what is kept between runs ---------------- */
// links: every tool, skill, subagent and MCP server seen, with use counts (the screen's コミュ)
// usage: rate-limit readings, to work out the pace and each day's share of the week
// past: ended sessions, so the screen can offer `claude --resume`
// daily: each day's turns, tokens, cost, channels and what was used (the calendar's day sheet)
// life: the person's status (Lv, EXP, five abilities, records), counted from the day it began; tz: the screen's time zone
const S = { links: {}, usage: { five: null, seven: null, series5: [], series7: [], days: {} }, past: [], nums: {}, daily: {}, life: null, tz: '' }
try { Object.assign(S, JSON.parse(readFileSync(STATE_FILE, 'utf8'))) } catch {}
if (S.tz && !setTz(S.tz)) S.tz = ''
let saveDirty = false
function save() {
  saveDirty = false
  try { const tmp = STATE_FILE + '.tmp'; writeFileSync(tmp, JSON.stringify(S)); renameSync(tmp, STATE_FILE) } catch (e) { log('save failed', e.message) }
}
const markSave = () => { saveDirty = true }
setInterval(() => { if (saveDirty) save() }, 5000).unref()

/* ---------------- channels: one per terminal ---------------- */
const chans = new Map()
const STL = { work: '作業中', wait: '承認待ち', idle: '入力待ち', off: '終了' }
function freeNum(id) {
  const holder = n => [...chans.values()].find(c => c.num === n && c.id !== id)
  const take = n => { const h = holder(n); if (h) { chans.delete(h.id); broadcast({ type: 'gone', chan: h.id }) } S.nums[id] = n; markSave(); return n }
  if (S.nums[id]) { const h = holder(S.nums[id]); if (!h || h.status === 'off') return take(S.nums[id]) }
  for (let n = 1; ; n++) { const h = holder(n); if (!h) return take(n); if (h.status === 'off' && n <= 9) return take(n) }
}
function pruneNums() { for (const id of Object.keys(S.nums)) if (!chans.has(id)) delete S.nums[id] }
function nameFor(cwd, id) {
  const base = basename(String(cwd || '').replace(/[\\/]+$/, '')) || 'claude'
  const taken = [...chans.values()].filter(c => c.id !== id && c.status !== 'off').map(c => c.name)
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`
}
function makeChan(id, h) {
  const c = {
    id, num: freeNum(id), name: nameFor(h.cwd, id), cwd: str(h.cwd, 1000), root: str(h.root, 1000), branch: str(h.branch, 200), model: str(h.model, 100),
    version: str(h.version, 40), mod: str(h.mod, 20), sid: str(h.sid, 100), resume: null, status: 'idle', now: '入力待ち', since: now(), startedAt: num(h.startedAt, now()),
    endedAt: null, lastSeen: now(), ctx: { tokens: 0, window: 200000, percent: 0 }, usd: 0, tok: 0, perTurn: [], blocks: [], tasks: [], files: {},
    agents: [], ops: [], active: null, loaded: h.loaded || null, commands: Array.isArray(h.commands) ? h.commands.slice(0, 400) : [], breakdown: h.breakdown || null,
    turn: null, waits: new Map(), queue: [], events: [], seq: 0, turnNo: 0, viaScreen: new Set(),
    q: null, pending: [], suggest: '',
  }
  if (Array.isArray(h.breakdown)) c.ctx.tokens = h.breakdown.reduce((a, b) => a + num(b && b.v), 0)
  if (h.loaded && num(h.loaded.window)) c.ctx.window = num(h.loaded.window)
  c.ctx.percent = Math.round(c.ctx.tokens / c.ctx.window * 100)
  chans.set(id, c)
  return c
}
function pub(c) {
  return {
    id: c.id, num: c.num, name: c.name, cwd: c.cwd, root: c.root, branch: c.branch, model: c.model, version: c.version, sid: c.sid, resume: c.resume,
    status: c.status, now: c.now, since: c.since, startedAt: c.startedAt, endedAt: c.endedAt, ctx: c.ctx, usd: c.usd, tok: c.tok, perTurn: c.perTurn,
    blocks: c.blocks, tasks: c.tasks, files: c.files, agents: c.agents, ops: c.ops, active: c.active,
    turn: c.turn && { id: c.turn.id, t0: c.turn.t0, ops: c.turn.ops }, turnNo: c.turnNo,
    ask: c.q ? c.q.id : null, pending: c.pending, suggest: c.suggest,
  }
}
// what the terminal loaded at start: sent with the channel's first view and when it changes
const meta = c => ({ loaded: c.loaded, commands: c.commands, breakdown: c.breakdown })
function setStatus(c, st, text, t = now()) { if (c.status !== st) c.since = t; c.status = st; c.now = text }
function block(c, k, label, t = now()) { const b = c.blocks[c.blocks.length - 1]; if (b && !b.e) b.e = t; c.blocks.push({ s: t, e: null, k, label: str(label, 80) }); trimBlocks(c) }
function endBlock(c, t = now()) { const b = c.blocks[c.blocks.length - 1]; if (b && !b.e) b.e = t }
function trimBlocks(c) { const cut = now() - 3 * 3600e3; c.blocks = c.blocks.filter(b => !b.e || b.e > cut).slice(-200) }

/* ---------------- links (コミュ) ---------------- */
const isLocalSrc = s => /^\.claude/.test(String(s || ''))
// earlier versions listed every loaded skill and agent: the ones from everywhere that were never called leave
for (const [id, l] of Object.entries(S.links)) if ((l.kind === 'skill' || l.kind === 'agent') && !l.uses && !isLocalSrc(l.src)) delete S.links[id]
function link(l) {
  if (!l || typeof l.id !== 'string' || !l.id) return null
  const id = str(l.id, 120)
  const x = S.links[id] || (S.links[id] = { id, kind: str(l.kind, 10) || 'tool', label: str(l.label, 120) || id, src: str(l.src, 120), uses: 0, last: null, days: {}, recent: [], dt: 0, first: now() })
  if (l.label) x.label = str(l.label, 120)
  if (l.src) x.src = str(l.src, 120)
  if (l.kind) x.kind = str(l.kind, 10)
  if (typeof l.dt === 'number') x.dt = Math.max(0, Math.round(l.dt))
  if (typeof l.desc === 'string' && l.desc.trim()) x.desc = str(l.desc, 1500)
  return x
}
// what a terminal loaded: a project's own skills and agents join コミュ then; everywhere's only when first called (a tool event brings them)
function loadedLink(l) {
  if (l && (l.kind === 'skill' || l.kind === 'agent') && !isLocalSrc(l.src) && !S.links[str(l.id, 120)]) return null
  return link(l)
}
const linkLive = new Map()   // link id → Set of channel ids using it right now
const changedLinks = new Set()
// while a terminal replays what it kept (after this hub restarted), what is already counted is not counted again
let replaying = false
function use(id, c, x, r, t = now()) {
  const l = S.links[id]; if (!l || replaying) return
  { const d = dayRec(t); d.links[id] = (d.links[id] || 0) + 1 }
  if (l.kind !== 'core') grewBy(id, t)
  l.uses++; l.last = t; if (!l.firstUse) l.firstUse = t; const d = dayKey(t); l.days[d] = (l.days[d] || 0) + 1
  const keys = Object.keys(l.days); if (keys.length > 60) for (const k of keys.sort().slice(0, keys.length - 60)) delete l.days[k]
  l.recent.push({ t, n: c.num, ch: c.name, x: str(x, 120), r: str(r, 60) }); if (l.recent.length > 20) l.recent.shift()
  changedLinks.add(id); markSave()
}
function live(id, c, on) {
  if (!id) return
  const s = linkLive.get(id) || new Set(); on ? s.add(c.id) : s.delete(c.id)
  if (s.size) linkLive.set(id, s); else linkLive.delete(id)
  changedLinks.add(id)
}
function linkPub(l) {
  const today = l.days[dayKey(now())] || 0
  return { id: l.id, kind: l.kind, label: l.label, src: l.src, desc: l.desc || '', uses: l.uses, last: l.last, firstUse: l.firstUse || null, today, dt: l.dt, recent: l.recent, live: [...(linkLive.get(l.id) || [])].map(id => chans.get(id)?.num).filter(Boolean) }
}

/* ---------------- each day's record ---------------- */
if (!S.daily || typeof S.daily !== 'object') S.daily = {}
function dayRec(t = now()) {
  const k = dayKey(t)
  let d = S.daily[k]
  if (!d) {
    d = S.daily[k] = { turns: 0, tok: 0, cr: 0, usd: 0, chans: {}, links: {} }
    const keys = Object.keys(S.daily).sort(); if (keys.length > 35) for (const x of keys.slice(0, keys.length - 35)) delete S.daily[x]
  }
  return d
}
function dayChan(d, c) { return d.chans[c.name] || (d.chans[c.name] = { turns: 0, tok: 0, usd: 0 }) }
const cents = v => Math.round(v * 100) / 100
function dailyView() {
  const out = {}
  for (const k of Object.keys(S.daily).sort().slice(-10)) {
    const d = S.daily[k]
    out[k] = {
      turns: d.turns, tok: d.tok, cr: d.cr, usd: cents(d.usd),
      chans: Object.entries(d.chans).map(([name, x]) => ({ name, turns: x.turns, tok: x.tok, usd: cents(x.usd) })).sort((a, b) => b.tok - a.tok || b.turns - a.turns).slice(0, 12),
      links: Object.entries(d.links).map(([id, n]) => { const l = S.links[id]; return { id, n, label: l ? l.label : id, kind: l ? l.kind : 'tool' } })
        .filter(x => x.kind !== 'core').sort((a, b) => b.n - a.n).slice(0, 15),
    }
  }
  return out
}

/* ---------------- your status: Lv, EXP and five abilities, from the day it began ---------------- */
// EXP comes from both how much you did (finished turns and tokens, up to a cap a day) and how you work
// (each day you work, the run of days, and every tool, skill, agent or MCP server you use for the first time).
const XP = { cap: 400, turn: 10, tok: 1e4, day: 50, streak: 10, streakMax: 7, first: 30 }
const LV_MAX = 99
const lvFloor = lv => 50 * lv * (lv - 1)                       // the EXP Lv n starts at: Lv n → n+1 takes 100·n
const toLv = exp => { let lv = 1; while (lv < LV_MAX && lvFloor(lv + 1) <= exp) lv++; return lv }
// abilities: what each kind of call builds up (the first that matches)
const STATS = [
  { k: 'inq', n: '調査', say: '調べる', of: id => /^(Read|Grep|Glob|WebSearch|WebFetch|ToolSearch|LSP)$/.test(id) || id === 'agent:Explore' },
  { k: 'make', n: '構築', say: '書く', of: id => /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(id) },
  { k: 'run', n: '実行', say: '動かす', of: id => /^(Bash|PowerShell|Monitor|TaskStop|BashOutput|KillShell|EnterWorktree|ExitWorktree)$/.test(id) },
  { k: 'lead', n: '段取り', say: '任せる', of: id => id.startsWith('agent:') || /^(Tasks|ExitPlanMode|EnterPlanMode|AskUserQuestion|SendMessage)$/.test(id) },
  { k: 'ext', n: '拡張', say: '広げる', of: id => id.startsWith('skill:') || id.startsWith('mcp:') },
]
const STAT_RANKS = [10, 50, 200, 600, 1500]                    // points for ranks 1 to 5
const weight = id => id.startsWith('agent:') ? 3 : id.startsWith('skill:') ? 2 : 1
if (!S.life || typeof S.life !== 'object') S.life = { since: now(), exp: 0, turns: 0, tok: 0, usd: 0, days: 0, streak: 0, best: 0, lastDay: '', first: {}, n: {}, stats: {} }
for (const k of ['first', 'n', 'stats']) if (!S.life[k] || typeof S.life[k] !== 'object') S.life[k] = {}
function dayXp(t) { const d = dayRec(t); return d.st || (d.st = { done: 0, tok: 0, vol: 0, habit: 0, first: 0 }) }
function gain(t, kind, n) { if (!(n > 0)) return; dayXp(t)[kind] += n; S.life.exp += n; markSave(); broadcastGlobal() }
// a call that finished: its ability, and EXP the first time it is ever used
function grewBy(id, t) {
  const L = S.life
  L.n[id] = (L.n[id] || 0) + 1
  const s = STATS.find(x => x.of(id)); if (s) L.stats[s.k] = (L.stats[s.k] || 0) + weight(id)
  if (!L.first[id]) { L.first[id] = t; gain(t, 'first', XP.first) }
}
// a turn that ended: the day's work, the run of days, and the day's volume up to its cap
function grewTurn(t, tokens, finished) {
  const L = S.life, k = dayKey(t), x = dayXp(t)
  if (finished) {
    if (L.lastDay !== k) {
      L.streak = L.lastDay && L.lastDay === dayKey(dayStart(t) - 1) ? L.streak + 1 : 1
      L.best = Math.max(L.best, L.streak); L.days++; L.lastDay = k
      gain(t, 'habit', XP.day + XP.streak * Math.min(L.streak - 1, XP.streakMax))
    }
    x.done++; L.turns++
  }
  x.tok += tokens; L.tok += tokens
  gain(t, 'vol', Math.min(XP.cap, x.done * XP.turn + Math.floor(x.tok / XP.tok)) - x.vol)
  markSave(); broadcastGlobal()
}
const xpOf = st => st ? st.vol + st.habit + st.first : 0
function statusView() {
  const L = S.life, lv = toLv(L.exp), t = now(), today = S.daily[dayKey(t)]?.st
  const alive = L.lastDay === dayKey(t) || L.lastDay === dayKey(dayStart(t) - 1)
  return {
    since: L.since, lv, max: LV_MAX, exp: L.exp, from: lvFloor(lv), to: lv >= LV_MAX ? null : lvFloor(lv + 1),
    today: { xp: xpOf(today), vol: today?.vol || 0, habit: today?.habit || 0, first: today?.first || 0, done: today?.done || 0, tok: today?.tok || 0 },
    stats: STATS.map(s => { const p = L.stats[s.k] || 0, r = STAT_RANKS.filter(v => p >= v).length; return { k: s.k, n: s.n, say: s.say, p, r, at: r ? STAT_RANKS[r - 1] : 0, to: STAT_RANKS[r] ?? null } }),
    rec: { days: L.days, streak: alive ? L.streak : 0, best: L.best, turns: L.turns, tok: L.tok, usd: cents(L.usd), kinds: Object.keys(L.first).length },
    top: Object.entries(L.n).map(([id, n]) => ({ id, n, l: S.links[id] })).filter(x => x.l && x.l.kind !== 'core').sort((a, b) => b.n - a.n).slice(0, 5).map(x => ({ id: x.id, n: x.n, label: x.l.label, kind: x.l.kind })),
    hist: Object.keys(S.daily).sort().filter(k => S.daily[k].st).slice(-14).map(k => ({ d: k, xp: xpOf(S.daily[k].st) })),
    rules: XP, ranks: STAT_RANKS,
  }
}

/* ---------------- usage: the account's rate-limit windows, shared by every terminal ---------------- */
function reading(kind, pc, resetsAt, t) {
  const key = kind === 'five_hour' ? 'five' : kind === 'seven_day' ? 'seven' : null
  if (!key) return
  const reset = Date.parse(resetsAt || '') || null
  const prev = S.usage[key]
  const series = key === 'five' ? 'series5' : 'series7'
  // a new window: the reset moved or the figure dropped
  if (prev && ((reset && prev.resetsAt && Math.abs(reset - prev.resetsAt) > 60e3) || pc + 0.5 < prev.pc)) S.usage[series] = []
  if (prev && prev.t > t) return
  S.usage[key] = { pc: clamp(pc, 0, 100), resetsAt: reset, t }
  const arr = S.usage[series]; const last = arr[arr.length - 1]
  if (!last || t - last.t > 60e3 || pc !== last.pc) arr.push({ t, pc })
  const keep = key === 'five' ? 6 * 3600e3 : 8 * 86400e3
  while (arr.length && arr[0].t < t - keep) arr.shift()
  if (arr.length > 2000) arr.splice(0, arr.length - 2000)
  if (key === 'seven') {
    const d = String(dayStart(t)), day = S.usage.days[d] || (S.usage.days[d] = { first: pc, last: pc, reset })
    day.last = pc; day.reset = reset
    for (const k of Object.keys(S.usage.days)) if (Number(k) < t - 9 * 86400e3) delete S.usage.days[k]
  }
  markSave()
}
// percent per hour (five-hour window) and per day (weekly window), from the readings
function pace(key) {
  const arr = S.usage[key === 'five' ? 'series5' : 'series7'], cur = S.usage[key]
  if (!cur || arr.length < 2) return null
  const span = key === 'five' ? 3600e3 : 86400e3, minSpan = key === 'five' ? 10 * 60e3 : 4 * 3600e3
  const t = cur.t, from = arr.find(p => p.t >= t - span) || arr[0]
  const dt = t - from.t
  if (dt < minSpan) return null
  return Math.max(0, (cur.pc - from.pc) / dt * span)
}
// each past day's share of the current weekly window, as the calendar shows it
function pastDays() {
  const cur = S.usage.seven; if (!cur || !cur.resetsAt) return {}
  const start = cur.resetsAt - 7 * 86400e3, today = dayStart(now()), out = {}
  const days = Object.keys(S.usage.days).map(Number).filter(d => d >= dayStart(start) && d < today).sort((a, b) => a - b)
  let prev = 0
  for (const d of days) { const x = S.usage.days[d]; if (x.reset && Math.abs(x.reset - cur.resetsAt) > 60e3) continue; out[d] = Math.max(0, x.last - prev); prev = x.last }
  return out
}
function globalView() {
  return { five: S.usage.five, seven: S.usage.seven, pace5: pace('five'), pace7: pace('seven'), past: pastDays(), daily: dailyView(), status: statusView() }
}
// the forecast a terminal's status line shows
function forecast() {
  const f = S.usage.five; if (!f) return null
  const p = pace('five'); if (p == null || !f.resetsAt) return { pc: f.pc }
  const left = Math.max(0, f.resetsAt - now()), proj = f.pc + p * left / 3600e3
  return { pc: f.pc, proj: Math.round(proj), hit: proj >= 100 ? now() + (100 - f.pc) / Math.max(p, 1e-6) * 3600e3 : null }
}

/* ---------------- events from a terminal ---------------- */
const TOOLS_NOW = { thinking: '考えています', responding: '返答を書いています', requesting: '応答を待っています', 'tool-input': '道具の準備をしています', 'tool-use': '道具を使っています' }
function apply(c, ev) {
  if (!ev || typeof ev.k !== 'string') return null
  const t = num(ev.t, now())
  const e = { ...ev, t }
  switch (ev.k) {
    case 'measure': {
      const x = ev.ctx || {}
      c.ctx = { tokens: Math.max(0, num(x.tokens)), window: Math.max(1, num(x.window, c.ctx.window)), percent: clamp(num(x.percent), 0, 100) }
      if (typeof ev.usd === 'number') {
        // the session's cost so far: what it grew by since the last reading is that day's
        if (typeof c.usdSeen === 'number' && ev.usd > c.usdSeen && !replaying) { const dd = ev.usd - c.usdSeen, d = dayRec(t); d.usd += dd; dayChan(d, c).usd += dd; S.life.usd += dd; markSave() }
        c.usdSeen = ev.usd; c.usd = ev.usd
      }
      for (const r of Array.isArray(ev.limits) ? ev.limits : []) reading(str(r.kind, 30), num(r.pc), r.resetsAt, t)
      broadcastGlobal()
      // the reading that follows a turn says how much that turn added
      const lt = c.lastTurn
      if (lt && c.status !== 'work' && t - lt.t < 20000) {
        c.lastTurn = null
        const grew = Math.max(0, c.ctx.tokens - lt.ctxAt)
        if (c.perTurn[lt.idx] !== undefined && c.perTurn[lt.idx] !== grew) {
          c.perTurn[lt.idx] = grew
          const g = { k: 'grew', id: lt.id, grew, t, seq: ++c.seq }
          c.events.push(g)
          return g
        }
      }
      return null // otherwise a measure is state, not transcript
    }
    case 'turn': {
      c.turnNo++
      c.turn = { id: str(ev.id, 80), t0: t, ctxAt: c.ctx.tokens, ops: 0, text: str(ev.text, 2000) }
      c.ops = []; c.suggest = ''
      // a prompt this screen sent has started: its pending bubble gives way to the turn
      if (ev.via === 'screen' && c.pending.length) {
        const i = ev.cid ? c.pending.findIndex(p => p.id === ev.cid) : c.pending.findIndex(p => p.text === str(ev.text, 2000))
        c.pending.splice(i >= 0 ? i : 0, 1)
      }
      if (ev.cid) e.cid = str(ev.cid, 40)
      setStatus(c, 'work', '依頼を受け取りました', t); block(c, 'work', ev.text || '続きの作業', t)
      e.text = str(ev.text, 8000); e.n = c.turnNo
      break
    }
    case 'user': e.text = str(ev.text, 8000); break
    case 'say': e.text = str(ev.text, 12000); if (c.status === 'work' && !ev.agent) c.now = '返答を書いています'; break
    case 'mode': if (c.status === 'work' && TOOLS_NOW[ev.mode]) c.now = TOOLS_NOW[ev.mode]; return null
    case 'tool': {
      const l = link(ev.link)
      e.name = str(ev.name, 120); e.input = str(ev.input, 400); e.link = l ? l.id : null
      if (c.turn && !ev.agent) c.turn.ops++
      if (l) { live(l.id, c, true); c.active = l.id; c.ops.push(l.id); if (c.ops.length > 20) c.ops.shift() }
      if (!c.waits.size) setStatus(c, 'work', `<b>${esc(e.name)}</b> を実行中：<code>${esc(e.input)}</code>`, t)
      if (ev.file && typeof ev.file.path === 'string') { const f = c.files[ev.file.path] || (c.files[ev.file.path] = { add: 0, del: 0 }); f.add += num(ev.file.add); f.del += num(ev.file.del); e.file = ev.file }
      if (Array.isArray(ev.todos)) c.tasks = ev.todos.slice(0, 40).map(x => ({ t: str(x.t, 200), st: ['todo', 'doing', 'done'].includes(x.st) ? x.st : 'todo' }))
      if (ev.task) applyTask(c, ev.task)
      c.liveTools = c.liveTools || new Map(); c.liveTools.set(e.id = str(ev.id, 80), { link: e.link, name: e.name, input: e.input, agent: ev.agent ? str(ev.agent, 80) : null, count: ev.count !== false })
      break
    }
    case 'toolEnd': {
      const id = str(ev.id, 80), lt = c.liveTools && c.liveTools.get(id)
      e.out = str(ev.out, 400)
      if (ev.task) applyTask(c, ev.task)
      if (lt) {
        c.liveTools.delete(id)
        if (lt.link) { live(lt.link, c, false); if (!ev.err && lt.count !== false) use(lt.link, c, lt.input, e.out, t) }
        if (c.active === lt.link) c.active = null
      }
      if (c.waits.delete(id) && !c.waits.size && c.status === 'wait') { setStatus(c, 'work', ev.err ? `<b>${esc(lt ? lt.name : '')}</b> は実行されませんでした` : '許可されました', t); block(c, 'work', c.turn ? c.turn.text : '', t) }
      if (c.q && c.q.id === id) { c.q = null; if (!c.waits.size && c.status === 'wait') { setStatus(c, 'work', '質問に答えました', t); block(c, 'work', c.turn ? c.turn.text : '', t) } }
      askGone(c, id)
      break
    }
    case 'question': {
      // Claude asks with options (AskUserQuestion): the terminal's dialog is open, and the screen can answer too
      const qs = (Array.isArray(ev.qs) ? ev.qs : []).slice(0, 4).map(x => ({
        q: str(x && x.q, 600), h: str(x && x.h, 40), multi: !!(x && x.multi),
        opts: (Array.isArray(x && x.opts) ? x.opts : []).slice(0, 8).map(o => ({ l: str(o && o.l, 120), d: str(o && o.d, 300) })),
      }))
      if (!qs.length) return null
      e.id = str(ev.id, 80); e.qs = qs
      c.q = { id: e.id, qs, t, sent: 0 }
      setStatus(c, 'wait', `質問：<b>${esc(qs[0].q)}</b>`, t); block(c, 'wait', qs[0].q, t)
      break
    }
    case 'questionEnd': {
      e.id = str(ev.id, 80); e.by = ev.by === 'screen' ? 'screen' : 'terminal'; e.err = !!ev.err
      if (ev.answers && typeof ev.answers === 'object') e.answers = Object.fromEntries(Object.entries(ev.answers).slice(0, 4).map(([k, v]) => [str(k, 600), str(v, 2000)]))
      if (c.q && c.q.id === e.id) { c.q = null; if (!c.waits.size && c.status === 'wait') { setStatus(c, 'work', e.err ? '質問は閉じられました' : e.by === 'screen' ? 'この画面で答えました' : '質問に答えました', t); block(c, 'work', c.turn ? c.turn.text : '', t) } }
      break
    }
    case 'wait': {
      e.id = str(ev.id, 80); e.name = str(ev.name, 120); e.input = str(ev.input, 400)
      c.waits.set(e.id, { name: e.name, input: e.input, t })
      setStatus(c, 'wait', `承認待ち：<b>${esc(e.name)}</b> <code>${esc(e.input)}</code>`, t); block(c, 'wait', e.input, t)
      break
    }
    case 'run': {
      const id = str(ev.id, 80)
      if (c.waits.delete(id) && !c.waits.size) { setStatus(c, 'work', ev.how === 'screen' ? 'この画面で許可しました' : '許可されました', t); block(c, 'work', c.turn ? c.turn.text : '', t) }
      askGone(c, id)
      break
    }
    case 'agent': {
      const l = link(ev.link)
      c.agents.push({ id: str(ev.id, 80), type: str(ev.type, 80), desc: str(ev.desc, 160), st: 'run', t }); if (c.agents.length > 30) c.agents.shift()
      break
    }
    case 'agentEnd': { const a = c.agents.find(x => x.id === ev.id); if (a) a.st = ev.stopped ? 'stop' : 'done'; break }
    case 'skill': { const l = link(ev.link); if (l) use(l.id, c, ev.args || '', '', t); break }
    case 'cmd': e.name = str(ev.name, 80); e.args = str(ev.args, 400); e.text = str(ev.text, 6000); break
    case 'compact': { const l = link({ id: 'compact', kind: 'core', label: '圧縮', src: '組み込み' }); use(l.id, c, ev.trigger === 'auto' ? '自動' : '手動', '', t); break }
    case 'turnEnd': {
      const u = ev.usage || {}
      c.tok += num(u.in) + num(u.cw) + num(u.out)
      if (!replaying) { const d = dayRec(t), x = dayChan(d, c), tk = num(u.in) + num(u.cw) + num(u.out); d.turns++; d.tok += tk; d.cr += num(u.cr); x.turns++; x.tok += tk; markSave(); grewTurn(t, tk, !ev.aborted) }
      if (c.turn) {
        const grew = Math.max(0, c.ctx.tokens - c.turn.ctxAt)
        c.perTurn.push(grew); if (c.perTurn.length > 40) c.perTurn.shift()
        c.lastTurn = { id: c.turn.id, ctxAt: c.turn.ctxAt, t, idx: c.perTurn.length - 1 }
        e.ops = c.turn.ops; e.grew = grew
        const l = link({ id: 'claude', kind: 'core', label: 'Claude', src: '組み込み' })
        use(l.id, c, c.turn.text || '（続きの作業）', `${c.turn.ops}件の操作`, t)
      }
      e.ms = num(ev.ms); e.aborted = !!ev.aborted; e.reason = str(ev.reason, 20)
      for (const [id, lt] of [...(c.liveTools || [])]) { if (lt.link) live(lt.link, c, false); c.liveTools.delete(id) }
      c.waits.clear(); askGoneAll(c); c.q = null
      c.turn = null; c.active = null
      endBlock(c, t); setStatus(c, 'idle', e.aborted ? '止めました · 入力待ち' : '入力待ち', t)
      break
    }
    case 'clear': {
      if (c.sid) remember(c, 'clear')
      { const l = link({ id: 'clear', kind: 'core', label: 'リセット', src: '組み込み' }); use(l.id, c, '', '', t) }
      c.sid = str(ev.sid, 100); c.perTurn = []; c.tasks = []; c.files = {}; c.agents = []; c.ops = []; c.turnNo = 0
      setStatus(c, 'idle', '入力待ち', t)
      break
    }
    case 'end': {
      c.resume = str(ev.resume, 100) || c.sid
      endBlock(c, t); c.endedAt = t; setStatus(c, 'off', 'セッションは終了しています', t)
      for (const [, lt] of c.liveTools || []) if (lt.link) live(lt.link, c, false)
      c.liveTools = new Map(); c.waits.clear(); askGoneAll(c); c.q = null; c.suggest = ''
      // what was waiting to be sent goes with the terminal
      for (const p of c.pending) if (!p.err) p.err = 'ターミナルが終了したため送れませんでした'
      remember(c, ev.reason)
      break
    }
    case 'loaded': {
      if (ev.loaded) c.loaded = ev.loaded
      if (ev.breakdown) c.breakdown = ev.breakdown
      if (Array.isArray(ev.commands)) c.commands = ev.commands.slice(0, 400)
      for (const l of Array.isArray(ev.links) ? ev.links : []) loadedLink(l)
      broadcastLinks(true)
      broadcast({ type: 'chan', chan: { ...pub(c), ...meta(c) } })
      return null
    }
    case 'info': if (ev.branch != null) c.branch = str(ev.branch, 200); if (ev.model) c.model = str(ev.model, 100); if (ev.sid) c.sid = str(ev.sid, 100); return null
    case 'desc': { const l = S.links[str(ev.id, 120)]; if (l && typeof ev.desc === 'string' && ev.desc.trim() && l.desc !== str(ev.desc, 1500)) { l.desc = str(ev.desc, 1500); changedLinks.add(l.id); markSave() } return null }
    case 'suggest': c.suggest = str(ev.text, 400); return null
    case 'did': {
      if (ev.ok === false) {
        e.error = str(ev.error, 300)
        const p = c.pending.find(x => x.id === ev.cid); if (p) p.err = e.error || '送れませんでした'
      }
      break
    }
    case 'note': e.text = str(ev.text, 600); break
    default: return null
  }
  e.seq = ++c.seq
  c.events.push(e); if (c.events.length > EVENTS_KEPT) c.events.splice(0, c.events.length - EVENTS_KEPT)
  return e
}
function applyTask(c, x) {
  if (x.op === 'create' && x.t) c.tasks.push({ id: str(x.id, 40), t: str(x.t, 200), st: 'todo' })
  if (x.op === 'update') { const k = c.tasks.find(y => y.id === x.id); if (k) { if (x.st) k.st = x.st === 'in_progress' ? 'doing' : x.st === 'completed' ? 'done' : x.st === 'deleted' ? 'gone' : 'todo'; if (x.t) k.t = str(x.t, 200) } c.tasks = c.tasks.filter(y => y.st !== 'gone') }
  if (c.tasks.length > 60) c.tasks = c.tasks.slice(-60)
}
const esc = t => String(t).replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]))
function remember(c, reason) {
  const first = c.events.find(e => e.k === 'turn' && e.text)
  S.past = S.past.filter(p => p.id !== (c.resume || c.sid))
  S.past.unshift({ id: c.resume || c.sid, cwd: c.cwd, name: c.name, title: first ? str(first.text, 60) : '', endedAt: now(), reason: str(reason, 20) })
  S.past = S.past.slice(0, 30); markSave()
}

/* ---------------- the screen's streams ---------------- */
const streams = new Set()   // { res, client }
function emit(s, msg) { try { s.res.write(`data: ${JSON.stringify(msg)}\n\n`) } catch {} }
function broadcast(msg) { for (const s of streams) emit(s, msg) }
const chanDirty = new Set()
setInterval(() => {
  for (const id of chanDirty) { const c = chans.get(id); if (c) broadcast({ type: 'chan', chan: pub(c) }) }
  chanDirty.clear()
  broadcastLinks(false)
}, 200).unref()
function broadcastLinks(all) {
  if (!changedLinks.size && !all) return
  const ids = all ? Object.keys(S.links) : [...changedLinks]
  changedLinks.clear()
  broadcast({ type: 'links', links: ids.map(id => S.links[id]).filter(Boolean).map(linkPub) })
}
let globalTimer = null
function broadcastGlobal() { if (globalTimer) return; globalTimer = setTimeout(() => { globalTimer = null; broadcast({ type: 'global', usage: globalView() }) }, 300) }
function snapshot(client) {
  return {
    type: 'hello', hub: { version: VERSION, port: PORT, home: homedir() }, approvals: apView(client), usage: globalView(),
    chans: [...chans.values()].sort((a, b) => a.num - b.num).map(c => ({ ...pub(c), ...meta(c), events: c.events })),
    links: Object.values(S.links).map(linkPub), past: S.past, asks: [...asks.values()].filter(a => !a.decision).map(askPub),
  }
}
setInterval(() => broadcast({ type: 'ping', t: now() }), 20e3).unref()

/* ---------------- approvals from the screen (off unless turned on and paired) ---------------- */
const AP = { on: false, code: null, codeExp: 0, tries: 0, paired: new Set(), end: null }   // end: why the last code stopped working
const asks = new Map()
function apView(client) {
  const pairing = !!AP.code && AP.codeExp > now()
  return { on: AP.on, pairing, exp: pairing ? AP.codeExp : 0, end: pairing ? null : AP.end, pairedHere: !!client && AP.paired.has(client), paired: AP.paired.size }
}
/** What every terminal is handed while a browser is being paired: its mod frames the code above the prompt. */
function pairState() { return AP.code && AP.codeExp > now() ? { code: AP.code, exp: AP.codeExp } : null }
function endPair(why) { if (!AP.code) return; AP.code = null; AP.end = why; log('pairing code', why); broadcastAp() }
function tellTerminals(text) { for (const c of chans.values()) if (c.status !== 'off') c.queue.push({ id: randomBytes(6).toString('hex'), type: 'toast', text, timeoutMs: 15000 }) }
function pairedWatching() { for (const s of streams) if (AP.paired.has(s.client)) return true; return false }
function askPub(a) { const c = chans.get(a.chan); return { id: a.id, chan: a.chan, num: c ? c.num : 0, name: c ? c.name : '', tool: a.tool, input: a.input, exp: a.exp, decision: a.decision || null } }
function decide(a, decision, how) {
  if (!a || a.decision) return
  a.decision = decision; a.how = how
  for (const w of a.waiters) w(decision)
  a.waiters = []
  broadcast({ type: 'askEnd', id: a.id, decision, how })
  setTimeout(() => asks.delete(a.id), 60e3).unref()
}
function askGone(c, toolId) { const a = asks.get(toolId); if (a && a.chan === c.id) decide(a, 'gone', 'terminal') }
function askGoneAll(c) { for (const a of asks.values()) if (a.chan === c.id) decide(a, 'gone', 'terminal') }
setInterval(() => { for (const a of asks.values()) if (!a.decision && a.exp < now()) decide(a, 'terminal', 'timeout') }, 1000).unref()
function setApprovals(on) {
  if (!on) {
    AP.on = false; AP.code = null; AP.end = null; AP.paired.clear()
    for (const a of asks.values()) decide(a, 'terminal', 'off')
  }
  broadcastAp()
}
function broadcastAp() { for (const s of streams) emit(s, { type: 'ap', approvals: apView(s.client) }) }

/* ---------------- HTTP ---------------- */
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
  res.end(data)
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = []
    req.on('data', ch => { size += ch.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy() } else chunks.push(ch) })
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) } catch (e) { reject(e) } })
    req.on('error', reject)
  })
}
// the screen and the guide, read when they change on disk; a copy read earlier keeps being served if the
// folder goes away under a running hub (one started from a plugin .zip unpacks to a folder that is removed)
const pages = new Map()
function page(name) {
  const p = join(HERE, name), had = pages.get(name)
  try { const m = statSync(p).mtimeMs; if (!had || m !== had.mtime) pages.set(name, { mtime: m, html: readFileSync(p, 'utf8') }) }
  catch { if (!had) return `<!doctype html><meta charset="utf-8"><title>Fogcast</title><p>${name} が見つかりません。Fogcast のフォルダを確かめてください。</p>` }
  return pages.get(name).html
}
page('ui.html'); page('guide.html')
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
let lastActivity = now()
const routes = {
  /* ----- from the mod ----- */
  'POST /api/mod/hello': (b) => {
    const id = str(b.chan, 64); if (!/^[0-9a-z-]{6,64}$/.test(id)) return [400, { error: 'chan' }]
    let c = chans.get(id)
    if (!c || c.status === 'off') { if (c) chans.delete(id); c = makeChan(id, b) }
    else Object.assign(c, { cwd: str(b.cwd, 1000) || c.cwd, branch: str(b.branch, 200) || c.branch, model: str(b.model, 100) || c.model, sid: str(b.sid, 100) || c.sid })
    if (b.mod) c.mod = str(b.mod, 20)
    if (b.loaded) c.loaded = b.loaded
    if (b.breakdown) c.breakdown = b.breakdown
    if (Array.isArray(b.commands)) c.commands = b.commands.slice(0, 400)
    for (const l of Array.isArray(b.links) ? b.links : []) loadedLink(l)
    // a terminal that comes back after the hub restarted replays what it kept
    if (Array.isArray(b.replay) && !c.events.length) { replaying = true; try { for (const ev of b.replay.slice(-EVENTS_KEPT)) apply(c, ev) } finally { replaying = false } }
    if (b.resumed) c.resumedFrom = str(b.resumed, 100)
    c.lastSeen = now()
    log('hello', c.num, c.name, c.cwd)
    broadcast({ type: 'chan', chan: { ...pub(c), ...meta(c), events: c.events } })
    broadcastLinks(true)
    return [200, { ok: true, num: c.num, name: c.name, approvals: { on: AP.on && pairedWatching() }, pair: pairState(), forecast: forecast() }]
  },
  'POST /api/mod/sync': (b) => {
    const c = chans.get(str(b.chan, 64))
    if (!c) return [200, { ok: false, error: 'unknown-chan' }]
    c.lastSeen = now()
    if (c.status === 'off' && !c.endedByMod) {
      setStatus(c, 'idle', '入力待ち'); c.endedAt = null; c.resume = null
      S.past = S.past.filter(p => p.id !== c.sid); markSave()
    }
    for (const ev of Array.isArray(b.events) ? b.events.slice(0, 500) : []) {
      if (ev && ev.k === 'end') c.endedByMod = true
      const e = apply(c, ev)
      if (e) broadcast({ type: 'ev', chan: c.id, ev: e })
    }
    chanDirty.add(c.id)
    const commands = c.queue.splice(0)
    return [200, { ok: true, num: c.num, commands, approvals: { on: AP.on && pairedWatching() }, pair: pairState(), forecast: forecast() }]
  },
  'POST /api/mod/ask': (b) => {
    const c = chans.get(str(b.chan, 64)); if (!c) return [200, { mode: 'terminal' }]
    if (!AP.on || !pairedWatching()) return [200, { mode: 'terminal' }]
    const id = str(b.id, 80)
    const a = { id, chan: c.id, tool: str(b.tool, 120), input: str(b.input, 600), exp: now() + ASK_MS, decision: null, waiters: [] }
    asks.set(id, a)
    broadcast({ type: 'ask', ask: askPub(a) })
    return [200, { mode: 'screen', exp: a.exp }]
  },
  'POST /api/mod/ask/wait': (b, req, res) => {
    const a = asks.get(str(b.id, 80))
    if (!a) return [200, { decision: 'terminal' }]
    if (a.decision) return [200, { decision: a.decision }]
    return new Promise(resolve => {
      const timer = setTimeout(() => { a.waiters = a.waiters.filter(w => w !== done); resolve([200, { decision: null }]) }, 25e3)
      const done = d => { clearTimeout(timer); resolve([200, { decision: d }]) }
      a.waiters.push(done)
      req.on('close', () => { clearTimeout(timer); a.waiters = a.waiters.filter(w => w !== done) })
    })
  },
  'POST /api/mod/ask/answer': (b) => { const a = asks.get(str(b.id, 80)); if (a) decide(a, b.decision === 'cancel' ? 'gone' : 'terminal', 'terminal'); return [200, { ok: true }] },
  'POST /api/mod/pair/cancel': (b) => { if (AP.code && (!b.code || str(b.code, 20) === AP.code)) endPair('cancel-terminal'); return [200, { ok: true }] },
  'POST /api/mod/open': async () => {
    const url = `http://127.0.0.1:${PORT}/#k=${TOKEN}`
    return [200, { opened: await openBrowser(url) }]
  },
  'POST /api/mod/bye': (b) => { const c = chans.get(str(b.chan, 64)); if (c && c.status !== 'off') { const e = apply(c, { k: 'end', reason: str(b.reason, 20) || 'exit', resume: b.resume, t: now() }); if (e) broadcast({ type: 'ev', chan: c.id, ev: e }); chanDirty.add(c.id) } return [200, { ok: true }] },

  /* ----- from the screen ----- */
  'GET /api/ui/stream': (b, req, res, client) => {
    const tz = str(req.headers['x-fogcast-tz'], 64)
    if (tz && tz !== S.tz && setTz(tz)) { S.tz = tz; markSave(); log(`days are counted in ${tz}`) }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Connection': 'keep-alive' })
    const s = { res, client }
    streams.add(s)
    emit(s, snapshot(client))
    req.on('close', () => { streams.delete(s); lastActivity = now() })
    return null
  },
  'POST /api/ui/send': (b) => {
    const c = chans.get(str(b.chan, 64)); if (!c || c.status === 'off') return [409, { error: 'このチャンネルは終了しています' }]
    const text = str(b.text, 100000).trim(); if (!text) return [400, { error: 'empty' }]
    const id = randomBytes(6).toString('hex')
    c.queue.push({ id, type: 'prompt', text })
    // shown at once on every screen, until its turn starts (or it could not be sent)
    c.pending = c.pending.filter(p => !p.err).slice(-9)
    c.pending.push({ id, text: str(text, 2000), t: now(), queued: c.status !== 'idle', local: str(b.local, 40) || null })
    c.suggest = ''                                          // a prompt sent puts the suggestion away, as in the terminal
    chanDirty.add(c.id)
    return [200, { ok: true, id, queued: c.status !== 'idle' }]
  },
  'POST /api/ui/unsend': (b) => {
    const c = chans.get(str(b.chan, 64)); if (!c) return [404, { error: 'chan' }]
    const id = str(b.id, 40)
    c.pending = c.pending.filter(p => p.id !== id || !p.err)          // only one that could not be sent is put away
    chanDirty.add(c.id)
    return [200, { ok: true }]
  },
  'POST /api/ui/question': (b) => {
    const c = chans.get(str(b.chan, 64)); if (!c || c.status === 'off') return [409, { error: 'このチャンネルは終了しています' }]
    const q = c.q; if (!q || q.id !== str(b.id, 80)) return [409, { error: 'この質問はもう閉じています' }]
    const sent = Array.isArray(b.answers) ? b.answers : null
    if (!sent || sent.length !== q.qs.length) return [400, { error: 'すべての質問に答えてください' }]
    const answers = []
    for (let i = 0; i < q.qs.length; i++) {
      const x = q.qs[i], a = sent[i] || {}
      const pick = Array.isArray(a.pick) ? [...new Set(a.pick)] : [], text = str(a.text, 4000).trim()
      if (pick.some(n => !Number.isInteger(n) || n < 0 || n >= x.opts.length) || (!x.multi && pick.length > 1)) return [400, { error: 'options' }]
      if (!pick.length && !text) return [400, { error: 'すべての質問に答えてください' }]
      answers.push({ pick, text })
    }
    q.sent = now()
    c.queue.push({ id: randomBytes(6).toString('hex'), type: 'answer', qid: q.id, answers })
    return [200, { ok: true }]
  },
  'POST /api/ui/command': (b) => {
    const c = chans.get(str(b.chan, 64)); if (!c || c.status === 'off') return [409, { error: 'このチャンネルは終了しています' }]
    const name = str(b.name, 80).replace(/^\//, '')
    if (!/^[\w:.-]+$/.test(name)) return [400, { error: 'name' }]
    c.queue.push({ id: randomBytes(6).toString('hex'), type: 'command', name, args: str(b.args, 4000) })
    return [200, { ok: true, queued: c.status !== 'idle' }]
  },
  'POST /api/ui/stop': (b) => { const c = chans.get(str(b.chan, 64)); if (!c) return [404, { error: 'chan' }]; c.queue.push({ id: randomBytes(6).toString('hex'), type: 'stop' }); return [200, { ok: true }] },
  'POST /api/ui/compact': (b) => { const c = chans.get(str(b.chan, 64)); if (!c || c.status === 'off') return [409, { error: 'chan' }]; c.queue.push({ id: randomBytes(6).toString('hex'), type: 'compact', instructions: str(b.instructions, 2000) }); return [200, { ok: true, queued: c.status !== 'idle' }] },
  // channels whose terminal has ended or stopped reporting, put away by the person; one still reporting stays
  'POST /api/ui/forget': (b) => {
    const ids = (Array.isArray(b.chans) ? b.chans : [b.chan]).slice(0, 50).map(x => str(x, 64))
    const gone = []
    for (const id of ids) { const c = chans.get(id); if (c && c.status === 'off') { chans.delete(c.id); gone.push(c.id); broadcast({ type: 'gone', chan: c.id }) } }
    if (gone.length) { pruneNums(); markSave(); log('put away', gone.length, 'ended channel(s)') }
    return [200, { ok: true, gone: gone.length }]
  },
  'POST /api/ui/approvals': (b, req, res, client) => {
    if (!b.on) { setApprovals(false); log('approvals off'); return [200, { ok: true }] }
    const live = [...chans.values()].filter(c => c.status !== 'off')
    if (!live.length) return [409, { error: 'no-terminal' }]
    AP.code = `${randomInt(0, 1e4).toString().padStart(4, '0')}-${randomInt(0, 1e4).toString().padStart(4, '0')}`
    AP.codeExp = now() + PAIR_MS; AP.tries = 0; AP.end = null
    // terminals of this version pick the code up with their next sync (pairState) and frame it above the prompt;
    // a terminal still running 0.1.0 only knows the passing notice
    for (const c of live) if (!c.mod) c.queue.push({ id: randomBytes(6).toString('hex'), type: 'toast', text: `Fogcast: ブラウザから承認するための合言葉は ${AP.code} です（5 分間有効）。心当たりがなければ無視してください。`, timeoutMs: 60e3 })
    log('pairing code issued')
    broadcastAp()
    return [200, { ok: true, pairing: true, terminals: live.map(c => ({ num: c.num, name: c.name })) }]
  },
  'POST /api/ui/pair': (b, req, res, client) => {
    if (!client) return [400, { error: 'client' }]
    if (!AP.code || AP.codeExp < now()) return [409, { error: 'expired' }]
    const ok = String(b.code || '').replace(/\D/g, '') === AP.code.replace(/\D/g, '')
    if (!ok) { if (++AP.tries >= 5) endPair('tries'); return [403, { error: 'wrong', left: Math.max(0, 5 - AP.tries) }] }
    AP.on = true; AP.code = null; AP.end = 'paired'; AP.paired.add(client)
    log('paired a screen')
    tellTerminals('Fogcast: ブラウザとつながりました。承認待ちになると、Fogcast の画面でも許可・拒否できます。')
    broadcastAp()
    return [200, { ok: true }]
  },
  'POST /api/ui/pair/cancel': () => { endPair('cancel'); return [200, { ok: true }] },
  'POST /api/ui/answer': (b, req, res, client) => {
    if (!AP.on || !AP.paired.has(client)) return [403, { error: 'not-paired' }]
    const a = asks.get(str(b.id, 80)); if (!a || a.decision) return [409, { error: 'gone' }]
    decide(a, b.decision === 'allow' ? 'allow' : 'deny', 'screen')
    return [200, { ok: true }]
  },
}
/** Linux running under WSL: the person's browser is on the Windows side. */
function isWsl() {
  if (platform() !== 'linux') return false
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true
  try { return /microsoft/i.test(readFileSync('/proc/version', 'utf8')) } catch { return false }
}
/** Ways to show a page in the person's browser, best first. */
function openers(url) {
  const p = platform()
  if (p === 'darwin') return [['open', [url]]]
  if (p === 'win32') return [['rundll32', ['url.dll,FileProtocolHandler', url]]]
  const list = []
  if (isWsl()) {
    // Windows' own handler, through WSL interop: on PATH as Windows appends it, or where Windows keeps it
    list.push(['rundll32.exe', ['url.dll,FileProtocolHandler', url]])
    list.push(['/mnt/c/Windows/System32/rundll32.exe', ['url.dll,FileProtocolHandler', url]])
    list.push(['wslview', [url]])
  }
  list.push(['xdg-open', [url]])
  return list
}
/** Runs an opener and settles on whether it worked: missing, or exiting with an error (xdg-open with no
 *  browser to hand exits 3), is not "opened"; one still running after a few seconds is taken as a browser starting. */
function launch(cmd, args) {
  return new Promise(resolve => {
    let ch, done = false
    const end = v => { if (!done) { done = true; resolve(v) } }
    const cwd = cmd.endsWith('.exe') && existsSync('/mnt/c') ? '/mnt/c' : undefined     // a Windows program is happier outside \\wsl.localhost
    try { ch = spawn(cmd, args, { detached: true, stdio: 'ignore', cwd }) } catch { return end(false) }
    ch.once('error', () => end(false))
    ch.once('exit', code => end(code === 0))
    ch.once('spawn', () => { ch.unref(); setTimeout(() => end(true), 3000).unref() })
  })
}
async function openBrowser(url) {
  for (const [cmd, args] of openers(url)) if (await launch(cmd, args)) { log('opened the screen with', cmd); return true }
  log('no way to open a browser here')
  return false
}
async function handle(req, res) {
  lastActivity = now()
  const host = String(req.headers.host || '').toLowerCase()
  // only ever answer to this machine's own addresses: a page that rebinds its domain to 127.0.0.1 is refused here
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return send(res, 403, { error: 'host' })
  const origin = req.headers.origin
  if (origin && origin !== `http://127.0.0.1:${PORT}` && origin !== `http://localhost:${PORT}`) return send(res, 403, { error: 'origin' })
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const html = { '/': 'ui.html', '/index.html': 'ui.html', '/guide': 'guide.html', '/guide.html': 'guide.html' }[url.pathname]
  if (req.method === 'GET' && html) {
    return send(res, 200, page(html), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' })
  }
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, app: 'fogcast', version: VERSION })
  const route = routes[`${req.method} ${url.pathname}`]
  if (!route) return send(res, 404, { error: 'not found' })
  if (!tokenOk(req.headers['x-fogcast-token'])) return send(res, 401, { error: 'token' })
  let body = {}
  if (req.method === 'POST') {
    if (!String(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'json' })
    try { body = await readBody(req) } catch { return send(res, 400, { error: 'body' }) }
  }
  const client = str(req.headers['x-fogcast-client'], 64) || null
  try {
    const out = await route(body, req, res, client)
    if (out) send(res, out[0], out[1])
  } catch (e) { log('error', req.url, e.stack || e.message); if (!res.headersSent) send(res, 500, { error: 'internal' }) }
}

/* ---------------- housekeeping ---------------- */
setInterval(() => {
  const t = now()
  for (const c of chans.values()) {
    if (c.status !== 'off' && t - c.lastSeen > STALE_MS) {
      const e = apply(c, { k: 'end', reason: 'lost', t: c.lastSeen })
      c.now = 'このターミナルからの報告が途絶えました'
      if (e) broadcast({ type: 'ev', chan: c.id, ev: e })
      chanDirty.add(c.id)
    }
    if (c.status === 'off' && c.endedAt && t - c.endedAt > KEEP_ENDED_MS) { chans.delete(c.id); broadcast({ type: 'gone', chan: c.id }) }
    trimBlocks(c)
  }
  if (Object.keys(S.nums).length > 40) pruneNums()
  if (AP.code && AP.codeExp < t) endPair('expired')
  const alive = [...chans.values()].some(c => c.status !== 'off')
  if (!alive && !streams.size && t - lastActivity > IDLE_EXIT_MS) { log('idle, exiting'); save(); try { writeFileSync(PID_FILE, '') } catch {} process.exit(0) }
}, 2000).unref()

/* ---------------- start ---------------- */
export function start() {
  const server = http.createServer((req, res) => { handle(req, res).catch(e => { log('fatal', e.message); try { send(res, 500, { error: 'internal' }) } catch {} }) })
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') { log(`port ${PORT} is in use (another hub is probably running)`); process.exit(0) }
    log('server error', e.message); process.exit(1)
  })
  server.keepAliveTimeout = 65e3
  server.listen(PORT, '127.0.0.1', () => { try { writeFileSync(PID_FILE, String(process.pid)) } catch {} log(`Fogcast hub ${VERSION} on http://127.0.0.1:${PORT} (pid ${process.pid})`) })
  const stop = () => { save(); try { if (readFileSync(PID_FILE, 'utf8').trim() === String(process.pid)) writeFileSync(PID_FILE, '') } catch {} process.exit(0) }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
  return server
}
if (process.env.FOGCAST_NO_START !== '1') start()
