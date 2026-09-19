#!/usr/bin/env node
import readline from 'node:readline';
import { SpaceStore } from './space-store.js';
import { TOOL_DEFINITIONS, handleToolCall } from './tools.js';

const store = new SpaceStore();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(id, result, error = null) {
  const payload = {
    jsonrpc: '2.0',
    id,
  };
  if (error) {
    payload.error = error;
  } else {
    payload.result = result;
  }
  process.stdout.write(JSON.stringify(payload) + '\n');
}

rl.on('line', async (line) => {
  if (!line.trim()) return;

  let msg;
  try {
    msg = JSON.parse(line);
  } catch (err) {
    sendResponse(null, null, { code: -32700, message: 'Parse error' });
    return;
  }

  const { id, method, params } = msg;

  switch (method) {
    case 'initialize': {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'microcosm-mcp',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
        },
      });
      break;
    }

    case 'notifications/initialized': {
      // Client handshake ack, no response needed
      break;
    }

    case 'tools/list': {
      sendResponse(id, {
        tools: TOOL_DEFINITIONS,
      });
      break;
    }

    case 'tools/call': {
      const { name, arguments: args } = params || {};
      const toolResult = await handleToolCall(store, name, args || {});
      sendResponse(id, toolResult);
      break;
    }

    case 'ping': {
      sendResponse(id, {});
      break;
    }

    default: {
      sendResponse(id, null, { code: -32601, message: `Method '${method}' not found` });
      break;
    }
  }
});
