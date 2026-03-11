---
name: mcp-client
description: Consult when implementing MCP client code — transports, tool management, sampling, elicitation, OAuth, health monitoring, crash recovery. Covers Phase 3 tasks.
---

# MCP Client Reference

## SDK Setup

```bash
npm install @modelcontextprotocol/sdk zod
```

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
```

## Creating a Client

```typescript
const client = new Client(
  { name: 'gho-work', version: '1.0.0' },
  {
    capabilities: {
      sampling: {},                    // enable if routing sampling through our LLM
      elicitation: { form: {} },       // enable for form-based user input
    },
    enforceStrictCapabilities: true,   // throw on unsupported methods
  }
);
```

## Stdio Transport (Local MCP Servers)

```typescript
const transport = new StdioClientTransport({
  command: 'node',
  args: ['./server.js'],
  env: { ...process.env, API_KEY: 'xxx' },  // ALWAYS spread process.env first
  cwd: '/path/to/working/dir',
});
await client.connect(transport);
```

**Critical**: Always spread `process.env` — omitting it loses `PATH` and the child can't find executables.

**Shutdown sequence**: `client.close()` closes stdin, sends SIGTERM, then SIGKILL if needed.

## Streamable HTTP Transport (Remote Servers)

```typescript
const transport = new StreamableHTTPClientTransport(
  new URL('https://remote-server.com/mcp'),
  {
    reconnectionOptions: {
      maxReconnectionDelay: 30000,
      initialReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1.5,
      maxRetries: 2,
    },
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    authProvider: myOAuthProvider,  // for OAuth flows
  }
);
await client.connect(transport);
```

## Tool Operations

**List tools** (with pagination):
```typescript
const allTools: Tool[] = [];
let cursor: string | undefined;
do {
  const { tools, nextCursor } = await client.listTools({ cursor });
  allTools.push(...tools);
  cursor = nextCursor;
} while (cursor);
```

**Call a tool**:
```typescript
const result = await client.callTool(
  { name: 'search', arguments: { query: 'test' } },
  { timeout: 30_000 }
);
if (result.isError) { /* handle */ }
```

**Dynamic tool list changes** — debounce rapid notifications:
```typescript
client.setNotificationHandler('notifications/tools/list_changed', async () => {
  const { tools } = await client.listTools();
  updateToolCache(serverId, tools);
});
```

## Sampling Handler

Route server sampling requests through our LLM (Copilot SDK):
```typescript
client.setRequestHandler('sampling/createMessage', async (request) => {
  const { messages, maxTokens } = request.params;
  const response = await copilotSDK.complete({ messages, maxTokens });
  return {
    model: response.model,
    role: 'assistant',
    content: { type: 'text', text: response.text },
  };
});
```

## Elicitation Handler

Surface server-initiated user prompts in the UI:
```typescript
client.setRequestHandler('elicitation/create', async (request) => {
  if (request.params.mode === 'form') {
    const userInput = await showFormDialog(request.params.requestedSchema);
    return { action: 'accept', content: userInput };
  }
  if (request.params.mode === 'url') {
    await shell.openExternal(request.params.url);
    return { action: 'accept', content: {} };
  }
});
```

## Health Monitoring

```typescript
async function healthCheck(client: Client, timeoutMs = 5000): Promise<boolean> {
  try { await client.ping({ timeout: timeoutMs }); return true; }
  catch { return false; }
}
// Run every 30s, reconnect after 3 consecutive failures
```

## Auto-Reconnection Pattern

```typescript
class McpServerConnection {
  private reconnectAttempts = 0;
  private maxAttempts = 5;

  private async handleDisconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxAttempts) {
      this.emit('permanently-failed', this.config.id);
      return;
    }
    const delay = 1000 * Math.pow(2, this.reconnectAttempts++);
    setTimeout(() => this.connect(), delay);
  }
}
```

## Multi-Server Management

Each MCP client is 1:1 with a server. Namespace tools to avoid collisions:
```typescript
getAggregatedTools(): Tool[] {
  return Array.from(this.servers.values()).flatMap(s =>
    s.tools.map(t => ({ ...t, name: `${s.id}__${t.name}` }))
  );
}
```

## OAuth for Remote Servers

MCP uses OAuth 2.1 + PKCE. Discovery flow:
1. Fetch `/.well-known/oauth-protected-resource` from MCP server
2. Get `authorization_servers` from response
3. Fetch `/.well-known/oauth-authorization-server` from auth server
4. Standard OAuth 2.1 flow with PKCE

Each remote server needs its own token storage (access + refresh tokens via safeStorage).

## Graceful Shutdown

```typescript
app.on('before-quit', async () => {
  await Promise.allSettled(servers.map(async (s) => {
    if (s.transport instanceof StreamableHTTPClientTransport) {
      await s.transport.terminateSession();
    }
    await s.client.close();
  }));
});
```

## Error Handling

```typescript
try {
  await client.callTool({ name: 'tool', arguments: {} }, { timeout: 30_000 });
} catch (error) {
  if (error instanceof ProtocolError) { /* JSON-RPC server error */ }
  else if (error instanceof SdkError) {
    switch (error.code) {
      case SdkErrorCode.RequestTimeout: /* ... */
      case SdkErrorCode.ConnectionClosed: /* ... */
      case SdkErrorCode.CapabilityNotSupported: /* ... */
    }
  }
}
```
