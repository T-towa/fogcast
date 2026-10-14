// A stand-in for the Messages API for images attached on the Fogcast screen: when the person's latest message comes with
// the row that names an image the hub keeps (…/uploads/<id>.png), it asks to Read that file, as Claude would; when the
// Read comes back, it says whether a picture came with it. "SLOW" in a message takes 9 s. Every request is logged to
// STUB_LOG, and with STUB_DUMP set, written whole there (one JSON per line).
import http from 'node:http'
import { appendFileSync } from 'node:fs'
const PORT = Number(process.env.STUB_PORT || 4390), LOG = process.env.STUB_LOG || '/dev/null', DUMP = process.env.STUB_DUMP || ''
const sse = (res, ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)
const partsOf = m => Array.isArray(m?.content) ? m.content : [{ type: 'text', text: String(m?.content ?? '') }]
http.createServer((req, res) => {
  let body = ''
  req.on('data', d => body += d)
  req.on('end', () => {
    const path = req.url.split('?')[0]
    if (req.method === 'POST' && path.endsWith('/v1/messages/count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"input_tokens":12}') }
    if (req.method !== 'POST' || !path.endsWith('/v1/messages')) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{}') }
    let j = {}; try { j = JSON.parse(body) } catch {}
    if (DUMP) appendFileSync(DUMP, JSON.stringify(j) + '\n')
    const main = Array.isArray(j.tools) && j.tools.length > 0
    // the person's side since Claude last spoke: the rows and the prompt, or what a tool gave back
    const msgs = j.messages || []; let k = msgs.length; while (k > 0 && msgs[k - 1].role !== 'assistant') k--
    const mine = msgs.slice(k).filter(m => m.role === 'user').flatMap(partsOf)
    const results = mine.filter(p => p.type === 'tool_result')
    const text = mine.filter(p => p.type === 'text').map(p => p.text).join('\n')
    const said = text.split('\n').filter(l => l.trim() && !l.startsWith('<system-reminder>')).pop() || ''
    const pic = /(\/\S+\/uploads\/[0-9a-f]{16}\.(?:png|jpg|gif|webp))/.exec(text)?.[1]
    let answer, tool = null
    if (results.length) {
      const c = results.at(-1).content, blocks = Array.isArray(c) ? c : [{ type: 'text', text: String(c) }]
      const img = blocks.find(b => b.type === 'image')
      answer = img ? `画像を受け取りました（${img.source?.media_type || '?'}）` : `画像なし: ${JSON.stringify(c).slice(0, 120)}`
    } else if (main && pic) tool = { name: 'Read', input: { file_path: pic } }
    else answer = main ? `答え：${said.slice(0, 80)}` : 'ok'
    appendFileSync(LOG, `POST ${path} main=${main} said=${JSON.stringify(said.slice(0, 60))} pic=${pic || '-'} results=${results.length} -> ${tool ? `Read ${tool.input.file_path}` : JSON.stringify(answer)}\n`)
    const go = () => {
      const model = j.model || 'stub', usage = { input_tokens: 12, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
      const msg = { id: 'msg_stub' + Date.now(), type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage }
      if (!j.stream) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ...msg, content: [{ type: 'text', text: answer || 'ok' }], stop_reason: 'end_turn' })) }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      sse(res, 'message_start', { type: 'message_start', message: msg })
      if (tool) {
        sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_stub' + Date.now(), name: tool.name, input: {} } })
        sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } })
        sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
        sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } })
      } else {
        sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
        sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: answer } })
        sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
        sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } })
      }
      sse(res, 'message_stop', { type: 'message_stop' }); res.end()
    }
    setTimeout(go, /SLOW/.test(said) && main && !results.length ? 9000 : Number(process.env.STUB_DELAY_MS || 0))
  })
}).listen(PORT, '127.0.0.1', () => appendFileSync(LOG, `listening ${PORT}\n`))
