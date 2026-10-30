// A minimal MCP server used by offline tests: it speaks the JSON-RPC stdio
// framing the pinned transport speaks, answers initialize/tools/list, and
// echoes the called tool name. It also records that it was launched, and
// whether a provider credential survived into its child process.
import { writeFileSync } from 'node:fs';

if (process.env.MCP_FIXTURE_LAUNCHED) {
  writeFileSync(process.env.MCP_FIXTURE_LAUNCHED, JSON.stringify({
    launched: true,
    moderadoTokenPresent: process.env.MODERADO_TOKEN === 'secret-sentinel',
  }));
}

let buffer = '';
function reply(id, result) {
  const body = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const at = buffer.indexOf('\r\n\r\n');
    if (at < 0) break;
    const match = buffer.slice(0, at).match(/Content-Length:\s*(\d+)/i);
    if (!match) break;
    const end = at + 4 + Number(match[1]);
    if (buffer.length < end) break;
    const message = JSON.parse(buffer.slice(at + 4, end));
    buffer = buffer.slice(end);
    if (message.method === 'initialize') reply(message.id, { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'echo-fixture', version: '0.0.1' } });
    else if (message.method === 'tools/list') reply(message.id, { tools: [{ name: 'echo', description: 'Echoes the call back.' }] });
    else if (message.method === 'tools/call') reply(message.id, { content: [{ type: 'text', text: `echo:${message.params?.arguments?.text ?? ''}` }] });
    else if (message.id !== undefined) reply(message.id, {});
  }
});

