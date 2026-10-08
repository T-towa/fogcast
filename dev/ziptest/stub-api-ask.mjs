// Stand-in for the Messages API: "ASK_ME" in the person's message asks a multiple-choice question
// (AskUserQuestion); "USE_SKILL:<name>" calls a skill; anything else answers "ok". Every request is
// logged to STUB_LOG and, with STUB_DUMP set, written whole to that folder.
import http from 'node:http'
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs'
const PORT = Number(process.env.STUB_PORT || 4390), LOG = process.env.STUB_LOG || '/dev/null', DUMP = process.env.STUB_DUMP || ''
if (DUMP) mkdirSync(DUMP, { recursive: true })
let n = 0
const sse = (res, ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)
http.createServer((req, res) => {
  let body = ''
  req.on('data', d => body += d)
  req.on('end', () => {
    const path = req.url.split('?')[0]
    if (req.method === 'POST' && path.endsWith('/v1/messages/count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"input_tokens":12}') }
    if (req.method === 'POST' && path.endsWith('/v1/messages')) return setTimeout(answer, Number(process.env.STUB_DELAY_MS || 0))
    res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}')
    function answer() {
      let j = {}; try { j = JSON.parse(body) } catch {}
      const k = ++n
      if (DUMP) writeFileSync(`${DUMP}/req-${String(k).padStart(3, '0')}.json`, JSON.stringify(j, null, 1))
      const sys = JSON.stringify(j.system || '').slice(0, 160)
      const users = (j.messages || []).filter(m => m.role === 'user')
      const partsOf = m => Array.isArray(m?.content) ? m.content : [{ type: 'text', text: String(m?.content ?? '') }]
      const parts = users.flatMap(partsOf)
      const texts = parts.filter(p => p.type === 'text').map(p => p.text).join(' ')
      const results = parts.filter(p => p.type === 'tool_result')
      appendFileSync(LOG, `#${k} model=${j.model} stream=${!!j.stream} tools=${(j.tools || []).length} msgs=${(j.messages || []).length} sys=${sys}\n   lastUser=${JSON.stringify(users.at(-1)).slice(0, 600)}\n`)
      const model = j.model || 'stub', usage = { input_tokens: 12, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
      const msg = { id: 'msg_stub' + k, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage }
      // the prompt-suggestion service and other side requests: a plain line
      const say = /SUGGEST/.test(sys + texts) ? 'テストを実行して結果を教えて' : 'ok'
      if (!j.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ ...msg, content: [{ type: 'text', text: say }], stop_reason: 'end_turn' }))
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      sse(res, 'message_start', { type: 'message_start', message: msg })
      const tool = (name, input) => {
        sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_stub' + Date.now(), name, input: {} } })
        sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } })
        sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
        sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } })
        sse(res, 'message_stop', { type: 'message_stop' }); res.end()
      }
      const has = name => (j.tools || []).some(t => t.name === name)
      const lastParts = partsOf(users.at(-1))
      const fresh = !lastParts.some(p => p.type === 'tool_result')
      const lastAsk = partsOf(users.at(-1)).filter(p => p.type === 'text').map(p => p.text).join(' ')
      if (/ASK_ME/.test(lastAsk) && fresh && has('AskUserQuestion')) return tool('AskUserQuestion', { questions: [
        { question: 'どちらの方式で進めますか？', header: '方式', options: [{ label: 'A案', description: '速いが粗い' }, { label: 'B案', description: '遅いが安全' }], multiSelect: false },
        ...(/ASK_ME2/.test(lastAsk) ? [{ question: 'どれを含めますか？', header: '範囲', options: [{ label: 'テスト', description: '単体テスト' }, { label: '文書', description: 'README' }, { label: '型', description: '型定義' }], multiSelect: true }] : []),
      ] })
      const want = /USE_SKILL:([\w-]+)/.exec(texts)
      if (want && !results.length && has('Skill')) return tool('Skill', { skill: want[1] })
      const lastText = lastParts.filter(p => p.type === 'text').map(p => p.text).join(' ')
      const reply = /SUGGESTION MODE/.test(lastText) ? 'テストを実行して結果を教えて' : results.length && !fresh ? `受け取りました: ${JSON.stringify(results.at(-1).content).slice(0, 200)}` : say
      sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
      sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply } })
      sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
      sse(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } })
      sse(res, 'message_stop', { type: 'message_stop' })
      res.end()
    }
  })
}).listen(PORT, '127.0.0.1', () => appendFileSync(LOG, `listening ${PORT}\n`))
