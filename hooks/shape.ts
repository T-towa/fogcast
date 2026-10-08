// How a tool call, a row or a reading is described on the Fogcast screen.
// Pure functions, no `$`: register.ts calls them and the tests check them.

export type LinkKind = 'core' | 'tool' | 'skill' | 'agent' | 'mcp'
export type Link = { id: string; kind: LinkKind; label: string; src?: string; dt?: number; desc?: string }
export type FileChange = { path: string; add: number; del: number }
export type Todo = { t: string; st: 'todo' | 'doing' | 'done' }
type Args = Record<string, unknown>

export const str = (v: unknown): string => (typeof v === 'string' ? v : '')
export const clip = (s: string, n: number): string => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}
const lines = (s: unknown): number => {
  const t = str(s)
  if (!t) return 0
  return t.split('\n').length - (t.endsWith('\n') ? 1 : 0)
}

/** A path as the screen shows it: relative to the session's folder when it is inside it. */
export function rel(path: string, cwd: string): string {
  if (!path) return ''
  const c = cwd.replace(/[\\/]+$/, '')
  if (c && (path.startsWith(c + '/') || path.startsWith(c + '\\'))) return path.slice(c.length + 1)
  return path
}

const TASK_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'])
const MCP = /^mcp__(.+?)__(.+)$/

/** Which コミュ card a tool call counts toward. */
export function linkFor(tool: string, a: Args): Link {
  if (tool === 'Skill') {
    const s = str(a.skill) || str(a.command) || str(a.name)
    if (s) return { id: `skill:${s.replace(/^\//, '')}`, kind: 'skill', label: s.replace(/^\//, '') }
  }
  if (tool === 'Agent' || tool === 'Task') {
    const t = str(a.subagent_type) || 'general-purpose'
    return { id: `agent:${t}`, kind: 'agent', label: t }
  }
  if (TASK_TOOLS.has(tool)) return { id: 'Tasks', kind: 'tool', label: 'Tasks', src: '組み込み' }
  const m = MCP.exec(tool)
  if (m) return { id: `mcp:${m[1]}`, kind: 'mcp', label: m[1]!, src: 'MCP' }
  return { id: tool, kind: 'tool', label: tool, src: '組み込み' }
}

/** The verb of the row: the tool, or for an MCP tool its server. */
export function verb(tool: string): string {
  const m = MCP.exec(tool)
  return m ? m[1]! : tool
}

function firstString(a: Args): string {
  for (const v of Object.values(a)) if (typeof v === 'string' && v.trim()) return v
  return ''
}
function host(url: string): string {
  try { const u = new URL(url); return u.host + (u.pathname === '/' ? '' : u.pathname) } catch { return url }
}

/** One line saying what the call does. */
export function summarize(tool: string, a: Args, cwd: string): string {
  const p = (k: string) => rel(str(a[k]), cwd)
  switch (tool) {
    case 'Bash': return clip(str(a.command).split('\n')[0] ?? '', 160)
    case 'Read': return clip(p('file_path'), 160)
    case 'Edit': case 'Write': case 'MultiEdit': return clip(p('file_path'), 160)
    case 'NotebookEdit': return clip(p('notebook_path'), 160)
    case 'Grep': return clip(`"${str(a.pattern)}" in ${p('path') || '.'}`, 160)
    case 'Glob': return clip(str(a.pattern) + (a.path ? ` in ${p('path')}` : ''), 160)
    case 'WebFetch': return clip(host(str(a.url)), 160)
    case 'WebSearch': return clip(str(a.query), 160)
    case 'Agent': case 'Task': return clip(`${str(a.subagent_type) || 'general-purpose'}：${str(a.description)}`, 160)
    case 'Skill': return clip(`${str(a.skill) || str(a.command)}${a.args ? ' ' + str(a.args) : ''}`, 160)
    case 'TodoWrite': return `${Array.isArray(a.todos) ? a.todos.length : 0} 件のタスク`
    case 'TaskCreate': return clip(str(a.subject) || str(a.description), 160)
    case 'TaskUpdate': return clip(`#${str(a.taskId) || String(a.taskId ?? '')}${a.status ? ' → ' + str(a.status) : ''}${a.subject ? ' ' + str(a.subject) : ''}`, 160)
    case 'AskUserQuestion': {
      const q = Array.isArray(a.questions) ? (a.questions[0] as Args | undefined) : undefined
      return clip(str(q?.question) || str(a.question), 160)
    }
    case 'ExitPlanMode': return '計画の確認'
  }
  const m = MCP.exec(tool)
  if (m) return clip(`${m[2]}${firstString(a) ? ' ' + firstString(a) : ''}`, 160)
  return clip(firstString(a), 160)
}

/** What a finished call came to, in a few words. */
export function outline(tool: string, r: { deny?: string; isError?: boolean; text?: string } | undefined): string {
  if (!r) return ''
  if (r.deny) return '拒否'
  const text = str(r.text)
  const first = (text.split('\n').find(x => x.trim()) ?? '').trim()
  if (r.isError) return clip(`エラー：${first}`, 60)
  switch (tool) {
    case 'Read': return `${lines(text)} 行`
    case 'Grep': case 'Glob': return text.trim() ? `${lines(text.trim())} 件` : '0 件'
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit': return '保存'
    case 'Bash': {
      const last = text.trim().split('\n').reverse().find(x => x.trim()) ?? ''
      return clip(last || '完了', 60)
    }
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': return '更新'
    case 'Agent': case 'Task': return '完了'
    case 'WebSearch': return '検索結果'
    case 'WebFetch': return '取得'
  }
  return clip(first || '完了', 60)
}

/** Lines a file-writing call adds and removes, roughly. */
export function fileChange(tool: string, a: Args, cwd: string): FileChange | null {
  const path = rel(str(a.file_path) || str(a.notebook_path), cwd)
  if (!path) return null
  if (tool === 'Write') return { path, add: lines(a.content), del: 0 }
  if (tool === 'Edit') return { path, add: lines(a.new_string), del: lines(a.old_string) }
  if (tool === 'MultiEdit' && Array.isArray(a.edits)) {
    let add = 0, del = 0
    for (const e of a.edits as Args[]) { add += lines(e.new_string); del += lines(e.old_string) }
    return { path, add, del }
  }
  if (tool === 'NotebookEdit') return { path, add: lines(a.new_source), del: 0 }
  return null
}

/** The task list as TodoWrite hands it over. */
export function todosOf(tool: string, a: Args): Todo[] | null {
  if (tool !== 'TodoWrite' || !Array.isArray(a.todos)) return null
  return (a.todos as Args[]).slice(0, 40).map(t => ({
    t: clip(str(t.content) || str(t.activeForm), 200),
    st: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'doing' : 'todo',
  }))
}

/** The text blocks of a row, joined. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(b => (b && typeof b === 'object' && (b as Args).type === 'text' ? str((b as Args).text) : '')).filter(Boolean).join('\n')
}

/**
 * What the person typed while a turn ran, as it reaches the model inside that turn (a `queued_command`
 * row the engine delivers), or ''. `typed` holds what they submitted over the turn: the one this row
 * carries is taken out of it, word for word; failing that, the row's own wording is read.
 */
export function midTurnText(row: { name?: string; content?: unknown } | undefined, origin: string | undefined, typed: string[]): string {
  if (row?.name !== 'queued_command') return ''
  const body = textOf(row.content)
  const i = typed.findIndex(t => body.includes(t))
  if (i >= 0) return typed.splice(i, 1)[0]!
  if (origin && origin !== 'composer' && origin !== 'bridge') return ''     // a task's notice, another session's message
  return (/while you were working:\n([\s\S]*?)\n\n/.exec(body)?.[1] ?? '').trim()
}

/** A longer text kept with its line breaks (a skill's description): trimmed, blank runs closed up, cut at `n`. */
export function keepText(s: string, n: number): string {
  const t = s.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/** A question Claude asks with AskUserQuestion, as the screen draws it. Options keep their places, so a pick is an index. */
export type Question = { q: string; h: string; multi: boolean; opts: { l: string; d: string }[] }
export function questionsOf(a: Args): Question[] {
  const qs = Array.isArray(a.questions) ? (a.questions as Args[]) : []
  return qs.slice(0, 4).map(x => ({
    q: keepText(str(x?.question), 600), h: clip(str(x?.header), 40), multi: x?.multiSelect === true,
    opts: (Array.isArray(x?.options) ? (x.options as Args[]) : []).slice(0, 8).map(o => ({ l: clip(str(o?.label), 120), d: clip(str(o?.description), 300) })),
  }))
}
/**
 * The answers a screen sent for a question, in the tool's own terms: each question's text → the chosen
 * label (several joined with ", ", as the terminal's dialog joins them) or what was typed. Every question
 * must be answered and every pick must be one of its options; anything else is null.
 */
export function answersFor(a: Args, sent: unknown): Record<string, string> | null {
  const qs = Array.isArray(a.questions) ? (a.questions as Args[]).slice(0, 4) : []
  if (!qs.length || !Array.isArray(sent) || sent.length !== qs.length) return null
  const out: Record<string, string> = {}
  for (let i = 0; i < qs.length; i++) {
    const x = qs[i]!, s = sent[i] as Args | undefined, q = str(x.question)
    const opts = Array.isArray(x.options) ? (x.options as Args[]) : []
    const pick = Array.isArray(s?.pick) ? [...new Set(s.pick as unknown[])] : []
    if (pick.some(n => !Number.isInteger(n) || (n as number) < 0 || (n as number) >= Math.min(opts.length, 8))) return null
    if (!x.multiSelect && pick.length > 1) return null
    const labels = (pick as number[]).sort((m, n) => m - n).map(n => str(opts[n]?.label)).filter(Boolean)
    const typed = str(s?.text).trim().slice(0, 4000)
    const v = x.multiSelect ? [...labels, ...(typed ? [typed] : [])].join(', ') : typed || labels[0] || ''
    if (!q || !v) return null
    out[q] = v
  }
  return out
}

/** Where a skill or an agent was defined, in the screen's words. */
export function srcLabel(source: string, plugin?: string): string {
  if (plugin) return `プラグイン ${plugin}`
  switch (source) {
    case 'userSettings': case 'user': return '~/.claude'
    case 'projectSettings': case 'project': return '.claude'
    case 'localSettings': return '.claude（ローカル）'
    case 'policySettings': case 'managed': case 'policy': return '組織'
    case 'plugin': return 'プラグイン'
    case 'bundled': case 'builtin': case 'built-in': return '組み込み'
    default: return source || '—'
  }
}

/** A project's own (.claude in the repository) as against everywhere's (~/.claude, plugins, built in, the organization). */
export function isLocalSrc(src: unknown): boolean { return /^\.claude/.test(String(src ?? '')) }

export type Reading = { kind: string; percentUsed: number; resetsAt?: string }
export type Forecast = { pc: number; proj?: number; hit?: number | null } | null

function hhmm(t: number): string {
  const d = new Date(t)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The terminal's status line. */
export function statusLine(o: { num: number; ready: boolean; ctx?: number; limits: Reading[]; usd?: number; forecast: Forecast; pair?: string }): string {
  const parts: string[] = [o.ready ? `Fogcast ch.${o.num}` : 'Fogcast 未接続']
  // while a browser is being paired, its code leads the line (the band above the prompt shows it too)
  if (o.ready && o.pair) parts.push(`合言葉 ${o.pair}（Fogcast の画面に入力）`)
  if (o.ctx !== undefined) parts.push(`ctx ${o.ctx}%`)
  for (const w of o.limits) {
    if (w.kind === 'five_hour') {
      const f = o.forecast
      const tail = f && f.hit ? ` → ${hhmm(f.hit)} に上限` : f && f.proj !== undefined ? ` → 予報 ${Math.min(100, f.proj)}%` : ''
      parts.push(`5h ${w.percentUsed}%${tail}`)
    } else if (w.kind === 'seven_day') parts.push(`7d ${w.percentUsed}%`)
  }
  if (o.usd !== undefined) parts.push(`$${o.usd.toFixed(2)}`)
  parts.push('/fog で画面')
  return parts.join(' · ')
}

/** Whether a version string is older than another (x.y.z); anything unreadable is not, so it is left alone. */
export function older(v: unknown, than: string): boolean {
  const p = (s: string) => s.split('.').map(n => parseInt(n, 10) || 0)
  if (typeof v !== 'string' || !/^\d+\.\d+\.\d+/.test(v)) return false
  const a = p(v), b = p(than)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] ?? 0) < (b[i] ?? 0)
  return false
}
