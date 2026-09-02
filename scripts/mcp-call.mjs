#!/usr/bin/env node
// Call one MCP tool through the stdio wrapper (dist/index.js) from the shell.
// Exercises the full path: wrapper (file hydration) -> backend control socket -> Foundry module.
//
//   node scripts/mcp-call.mjs list
//   node scripts/mcp-call.mjs bridge-info '{}'
//   node scripts/mcp-call.mjs import-actor '{"filePath":"/abs/actor.json","destination":{"type":"pack","pack":"world.my-bestiary"}}'
//   node scripts/mcp-call.mjs run-script '{"script":"return game.world.id"}'
//
// Env: FOUNDRY_HOST/FOUNDRY_PORT are passed through to the wrapper like Claude Code does.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [, , toolName, argsJson] = process.argv;
if (!toolName) {
  console.error('usage: mcp-call.mjs <tool|list> [json-args]');
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = path.join(here, '..', 'packages', 'mcp-server', 'dist', 'index.js');

const child = spawn(process.execPath, [wrapper], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    FOUNDRY_HOST: process.env.FOUNDRY_HOST || 'localhost',
    FOUNDRY_PORT: process.env.FOUNDRY_PORT || '31415',
    FOUNDRY_CONNECTION_TYPE: process.env.FOUNDRY_CONNECTION_TYPE || 'websocket',
    LOG_LEVEL: process.env.LOG_LEVEL || 'warn',
  },
});

let buffer = '';
const pending = new Map();
let nextId = 1;

child.stdout.on('data', chunk => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise(resolve => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

const timer = setTimeout(() => {
  console.error('timeout');
  child.kill();
  process.exit(1);
}, Number(process.env.MCP_CALL_TIMEOUT || 120000));

try {
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp-call', version: '0.1' },
  });
  notify('notifications/initialized', {});

  if (toolName === 'list') {
    const res = await rpc('tools/list', {});
    for (const t of res.result?.tools || []) console.log(t.name);
  } else {
    const args = argsJson ? JSON.parse(argsJson) : {};
    const res = await rpc('tools/call', { name: toolName, arguments: args });
    if (res.error) {
      console.error('rpc error:', JSON.stringify(res.error));
      process.exitCode = 1;
    } else {
      const content = res.result?.content || [];
      for (const c of content) console.log(c.type === 'text' ? c.text : JSON.stringify(c));
      if (res.result?.isError) process.exitCode = 1;
    }
  }
} finally {
  clearTimeout(timer);
  child.stdin.end();
  child.kill();
}
