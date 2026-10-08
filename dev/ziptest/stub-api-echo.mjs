// A stand-in for the Messages API that answers each prompt with its own words, so conversations can be told apart.
// Every request is logged to STUB_LOG with the model and the effort it asked for. A prompt with "SLOW" takes 9 s.
import http from 'node:http'
import { appendFileSync } from 'node:fs'
const PORT = Number(process.env.STUB_PORT || 4390), LOG = process.env.STUB_LOG || '/dev/null'
const sse = (res, ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)
function lastPrompt(j) {
  const users = (j.messages || []).filter(m => m.role === 'user')
  const m = users[users.length - 1]; if (!m) return ''
  const parts = typeof m.content === 'string' ? [m.content] : (m.content || []).filter(b => b.type === 'text').map(b => b.text)
  return parts.filter(t => !t.startsWith('<system-reminder>') && !t.startsWith('<command-') && !t.startsWith('<local-command')).join(' ').trim()
}
http.createServer((req, res) => {
  let body = ''
  req.on('data', d => body += d)
  req.on('end', () => {
    const path = req.url.split('?')[0]
    if (req.method === 'POST' && path.endsWith('/v1/messages/count_tokens')) {
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"input_tokens":12}')
    }
    let j = {}; try { j = JSON.parse(body) } catch {}
    const said = lastPrompt(j)
    const main = Array.isArray(j.tools) && j.tools.length > 0
    // STUB_FIND: a text to look for in each request (whether a row the mod added reached the model)
    const find = process.env.STUB_FIND ? ` find=${body.includes(process.env.STUB_FIND)}` : ''
    appendFileSync(LOG, `${req.method} ${path} ${body.length}b${find} model=${j.model} effort=${JSON.stringify(j.output_config?.effort ?? j.thinking?.effort ?? null)} thinking=${JSON.stringify(j.thinking?.type ?? null)} main=${main} said=${JSON.stringify(said.slice(0, 50))}\n`)
    if (req.method === 'POST' && path.endsWith('/v1/messages')) return setTimeout(answer, /SLOW/.test(said) && main ? 9000 : Number(process.env.STUB_DELAY_MS || 0))
    res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}')
    function answer() {
      // a request to compact the conversation gets a summary in the shape Claude Code reads back
      const compacting = /^CRITICAL: Respond with TEXT ONLY/.test(said) || /summary of the conversation/i.test(said)
      const text = compacting ? '<analysis>テストの会話です。</analysis>\n<summary>1. Primary Request and Intent: テストの依頼に答えた。\n2. Pending Tasks: なし。</summary>' : main ? `答え：${said.slice(0, 80)}` : 'ok'
      const model = j.model || 'stub', usage = { input_tokens: 12, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
      const msg = { id: 'msg_stub', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage }
      if (!j.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ ...msg, content: [{ type: 'text', text }], stop_reason: 'end_turn' }))
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      sse(res, 'message_start', { type: 'message_start', message: msg })
      sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
      sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } })
      sse(res, 'message_stop', { type: 'message_stop' })
      res.end()
    }
  })
}).listen(PORT, '127.0.0.1', () => appendFileSync(LOG, `listening ${PORT}\n`))
