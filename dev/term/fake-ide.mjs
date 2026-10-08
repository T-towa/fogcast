// A stand-in for the VS Code extension's side of Claude Code's IDE link: the lock file Claude Code looks
// for, and the MCP server it talks to over a WebSocket. It answers the IDE's tools with nothing and writes
// every request it gets, with the time, to IDE_LOG, so a run can see what Claude Code asks of "VS Code" and
// when (closeAllDiffTabs at the start of each turn is what makes the real extension show its terminal).
//   IDE_PORT=4391 IDE_HOME=<HOME of the claude under test> IDE_WORK=<its folder> IDE_LOG=ide.log node fake-ide.mjs
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.IDE_PORT || 4391)
const HOME = process.env.IDE_HOME, WORK = process.env.IDE_WORK, LOG = process.env.IDE_LOG || 'ide.log'
const TOKEN = 'fake-ide-token'
const lockDir = join(HOME, '.claude', 'ide'), lock = join(lockDir, `${PORT}.lock`)
const log = (s) => appendFileSync(LOG, `${Date.now()} ${s}\n`)

const TOOLS = ['closeAllDiffTabs', 'close_tab', 'openDiff', 'openFile', 'getDiagnostics', 'getCurrentSelection', 'getLatestSelection',
  'getOpenEditors', 'getWorkspaceFolders', 'checkDocumentDirty', 'saveDocument']
const answer = (name) => name === 'closeAllDiffTabs' ? 'CLOSED_0_DIFF_TABS' : name === 'getDiagnostics' ? '[]' : 'ok'

function frame(text) {
  const body = Buffer.from(text), n = body.length
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255])
    : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b })()])
  return Buffer.concat([head, body])
}

const server = createServer((_, res) => { res.writeHead(404); res.end() })
server.on('upgrade', (req, sock) => {
  if (process.env.IDE_RAW) log(`upgrade ${JSON.stringify(req.headers)}`)
  if (!process.env.IDE_NOAUTH && req.headers['x-claude-code-ide-authorization'] !== TOKEN) { log('refused: bad token'); sock.destroy(); return }
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  sock.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`,
    'Sec-WebSocket-Protocol: mcp', '', ''].join('\r\n'))
  log('connected')
  const send = (o) => sock.write(frame(JSON.stringify(o)))
  let buf = Buffer.alloc(0)
  sock.on('data', (d) => {
    if (process.env.IDE_RAW) log(`raw ${d.length} ${d.subarray(0, 16).toString('hex')}`)
    buf = Buffer.concat([buf, d])
    for (;;) {
      if (buf.length < 2) return
      const op = buf[0] & 15, masked = buf[1] & 128
      let n = buf[1] & 127, at = 2
      if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); at = 4 }
      else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); at = 10 }
      const need = at + (masked ? 4 : 0) + n
      if (buf.length < need) return
      let body = buf.subarray(at + (masked ? 4 : 0), need)
      if (masked) { const m = buf.subarray(at, at + 4); body = Buffer.from(body.map((b, i) => b ^ m[i & 3])) }
      buf = buf.subarray(need)
      if (op === 8) { log('closed'); sock.end(); return }
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, body.length]), body])); continue }
      if (op !== 1) continue
      let msg; try { msg = JSON.parse(body.toString()) } catch { continue }
      if (msg.method === 'tools/call') log(`call ${msg.params?.name} ${JSON.stringify(msg.params?.arguments ?? {})}`)
      else if (msg.method) log(`${msg.id === undefined ? 'note' : 'request'} ${msg.method}`)
      if (msg.id === undefined) continue
      if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-ide', version: '0.0.1' } } })
      else if (msg.method === 'tools/list') send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS.map((name) => ({ name, description: name, inputSchema: { type: 'object', properties: {} } })) } })
      else if (msg.method === 'tools/call') send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: answer(msg.params?.name) }] } })
      else if (msg.method === 'ping') send({ jsonrpc: '2.0', id: msg.id, result: {} })
      else send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'not here' } })
    }
  })
  sock.on('error', (e) => log(`socket error ${e.message}`))
  sock.on('close', () => log('socket closed'))
})
server.listen(PORT, '127.0.0.1', () => {
  mkdirSync(lockDir, { recursive: true })
  writeFileSync(lock, JSON.stringify({ pid: process.pid, workspaceFolders: [WORK], ideName: 'Visual Studio Code', transport: 'ws', runningInWindows: false, authToken: TOKEN }))
  log(`listening ${PORT}`)
})
const bye = () => { try { rmSync(lock) } catch {} process.exit(0) }
process.on('SIGTERM', bye); process.on('SIGINT', bye)
