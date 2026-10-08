// Watches what the engine does around questions, suggestions and command listings, and writes it to a file.
import type { Register } from 'claude-code'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const LOG = '/tmp/claude-0/-home-claude/799e4518-7722-51e1-bd2f-c3fa3b975b03/scratchpad/term/t/probe.log'
let MODE = ''
async function log($: Any, ...a: unknown[]) {
  const line = `${new Date().toISOString().slice(11, 23)} ${a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}`
  try { await $.process.run(['sh', '-c', 'printf "%s\\n" "$1" >> "$0"', LOG, line.slice(0, 3000)], { timeoutMs: 3000 }) } catch {}
}
let described = 0
export const register: Register = (on) => {
  on('session.start', async ($: Any, e: Any, next: Any) => { const r = await next(e); MODE = (await $.env.get('PROBE_MODE')) || ''; await log($, 'session.start', { interactive: e.isInteractive, MODE }); return r })
  on('tool.call', async ($: Any, e: Any, next: Any) => {
    if (e.tool !== 'AskUserQuestion') return next(e)
    await log($, 'tool.call AskUserQuestion', { id: e.tool_use_id, keys: Object.keys(e), questions: e.questions })
    const p = next(e)
    p.then((r: Any) => log($, 'next resolved', r), (err: Any) => log($, 'next rejected', String(err?.message ?? err)))
    if (MODE !== 'screen') return p
    await $.clock.sleep(5000)
    const q = e.questions[0]
    const answers = { [q.question]: q.options[1].label }
    await log($, 'answering from the probe', answers)
    return { result: { questions: e.questions, answers } }
  })
  on('classic.PermissionRequest', async ($: Any, e: Any, next: Any) => { await log($, 'PermissionRequest', e.tool_name); const r = await next(e); await log($, 'PermissionRequest result', r); return r })
  on('ui.render', { component: 'AskUserQuestion' }, async ($: Any, e: Any, next: Any) => { void log($, 'render AskUserQuestion', { n: e.props?.questions?.length }); return next(e) })
  on('prompt.suggest', async ($: Any, e: Any, next: Any) => { const r = await next(e); await log($, 'prompt.suggest', { text: e.text, origin: e.origin, r }); return r })
  on('command.describe', async ($: Any, e: Any, next: Any) => {
    const r = await next(e)
    described++
    if (described <= 3 || e.argumentHint || r?.argumentHint || /check-rules|house|fix-issue/.test(e.command)) await log($, 'command.describe', described, { command: e.command, hint: e.argumentHint, rhint: r?.argumentHint, d: String(e.description).slice(0, 60), provider: e.provider })
    return r
  })
  on('agent.offer', async ($: Any, e: Any, next: Any) => { const r = await next(e); await log($, 'agent.offer', { agent: e.agent, source: e.source, d: String(e.description).slice(0, 80), len: String(e.description).length, r }); return r })
  on('turn.start', async ($: Any, e: Any, next: Any) => { await log($, 'turn.start', e.text); return next(e) })
  on('turn.complete', async ($: Any, e: Any, next: Any) => { await log($, 'turn.complete', { aborted: e.isAborted, agent: e.agentId }); return next(e) })
}
