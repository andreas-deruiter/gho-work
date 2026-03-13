// tests/fixtures/test-mcp-server.mjs
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'test-server', version: '1.0.0' });

server.tool('echo', 'Returns the input text', { text: z.string() }, async ({ text }) => ({
  content: [{ type: 'text', text }],
}));

server.tool('add', 'Adds two numbers', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: 'text', text: String(a + b) }],
}));

server.tool('timestamp', 'Returns current timestamp', {}, async () => ({
  content: [{ type: 'text', text: new Date().toISOString() }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});
