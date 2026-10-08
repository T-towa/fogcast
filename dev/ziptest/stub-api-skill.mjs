// Minimal stand-in for the Messages API so a `claude -p` run costs nothing.
// Every model call answers "ok"; every request is logged to STUB_LOG.
import http from 'node:http'
import { appendFileSync } from 'node:fs'
const PORT = Number(process.env.STUB_PORT || 4390), LOG = process.env.STUB_LOG || '/dev/null'
const sse = (res, ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)
http.createServer((req, res) => {
  let body = ''
  req.on('data', d => body += d)
  req.on('end', () => {
    appendFileSync(LOG, `${req.method} ${req.url} ${body.length}b\n`)
    const path = req.url.split('?')[0]
    if (req.method === 'POST' && path.endsWith('/v1/messages/count_tokens')) {
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"input_tokens":12}')
    }
    if (req.method === 'POST' && path.endsWith('/v1/messages')) return setTimeout(answer, Number(process.env.STUB_DELAY_MS || 0))
    res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}')
    function answer() {
      let j = {}; try { j = JSON.parse(body) } catch {}
      const model = j.model || 'stub', usage = { input_tokens: 12, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
      const msg = { id: 'msg_stub', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage }
      if (!j.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ ...msg, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }))
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      sse(res, 'message_start', { type: 'message_start', message: msg })
      // "USE_SKILL:<name>" in the last person's message, with no tool result yet: call the Skill tool
      const users = (j.messages || []).filter(m => m.role === 'user'), last = users.at(-1)
      const partsOf = m => Array.isArray(m?.content) ? m.content : [{ type: 'text', text: String(m?.content ?? '') }]
      const parts = users.flatMap(partsOf)
      const want = /USE_SKILL:([\w-]+)/.exec(parts.filter(p => p.type === 'text').map(p => p.text).join(' '))
      appendFileSync(LOG, `tools=${(j.tools || []).map(t => t.name).join(',')} parts=${parts.map(p => p.type).join(',')} want=${want?.[1]} n=${(j.messages || []).length} roles=${(j.messages || []).map(m => m.role).join(',')} last=${JSON.stringify(last).slice(0, 400)}\n`)
      if (want && !parts.some(p => p.type === 'tool_result') && (j.tools || []).some(t => t.name === 'Skill')) {
        sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_stub' + Date.now(), name: 'Skill', input: {} } })
        sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ skill: want[1] }) } })
        sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
        sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } })
        sse(res, 'message_stop', { type: 'message_stop' })
        return res.end()
      }
      sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } })
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
      sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } })
      sse(res, 'message_stop', { type: 'message_stop' })
      res.end()
    }
  })
}).listen(PORT, '127.0.0.1', () => appendFileSync(LOG, `listening ${PORT}\n`))
