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
      // keep each request as the model would read it, to see what reached it
      if (process.env.STUB_DUMP) { try { appendFileSync(process.env.STUB_DUMP, JSON.stringify(j) + '\n') } catch {} }
      const model = j.model || 'stub', usage = { input_tokens: 12, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
      const msg = { id: 'msg_stub', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage }
      if (!j.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ ...msg, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }))
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      sse(res, 'message_start', { type: 'message_start', message: msg })
      sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } })
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
      sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } })
      sse(res, 'message_stop', { type: 'message_stop' })
      res.end()
    }
  })
}).listen(PORT, '127.0.0.1', () => appendFileSync(LOG, `listening ${PORT}\n`))
