# GitHub Copilot SDK Reference

> Adapted from [github/awesome-copilot](https://github.com/github/awesome-copilot/tree/main/plugins/copilot-sdk) (MIT)

Use when embedding AI agents in GHO Work, creating custom tools, implementing streaming responses, managing sessions, connecting to MCP servers, or wiring up the agent service.

**Status:** Technical Preview — expect breaking changes.

## Prerequisites

- GitHub Copilot CLI installed and authenticated
- Node.js 18+
- `npm install @github/copilot-sdk tsx`

Verify: `copilot --version`

## Architecture

```
GHO Work (Electron)
       |
  SDK Client (@github/copilot-sdk)
       | JSON-RPC
  Copilot CLI (server mode)
       |
  GitHub (models, auth)
```

The SDK manages the CLI process lifecycle. Communication via JSON-RPC over stdio or TCP.

## Quick Start — TypeScript

```typescript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient();
const session = await client.createSession({ model: "gpt-4.1" });
const response = await session.sendAndWait({ prompt: "What is 2 + 2?" });
console.log(response?.data.content);
await client.stop();
```

## Streaming Responses

```typescript
import { CopilotClient, SessionEvent } from "@github/copilot-sdk";

const client = new CopilotClient();
const session = await client.createSession({
  model: "gpt-4.1",
  streaming: true,
});

session.on((event: SessionEvent) => {
  if (event.type === "assistant.message_delta") {
    process.stdout.write(event.data.deltaContent);
  }
  if (event.type === "session.idle") {
    console.log();
  }
});

await session.sendAndWait({ prompt: "Tell me a short joke" });
await client.stop();
```

## Custom Tools

```typescript
import { CopilotClient, defineTool, SessionEvent } from "@github/copilot-sdk";

const getWeather = defineTool("get_weather", {
  description: "Get the current weather for a city",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "The city name" },
    },
    required: ["city"],
  },
  handler: async (args: { city: string }) => {
    // Call weather API here
    return { city: args.city, temperature: "72°F", condition: "sunny" };
  },
});

const session = await client.createSession({
  model: "gpt-4.1",
  streaming: true,
  tools: [getWeather],
});
```

**How tools work:**
1. Copilot sends a tool call request with parameters
2. SDK runs your handler function
3. Result is sent back to Copilot
4. Copilot incorporates the result into its response

## MCP Server Integration

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  mcpServers: {
    github: {
      type: "http",
      url: "https://api.githubcopilot.com/mcp/",
    },
  },
});
```

## Custom Agents

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  customAgents: [{
    name: "pr-reviewer",
    displayName: "PR Reviewer",
    description: "Reviews pull requests for best practices",
    prompt: "You are an expert code reviewer. Focus on security, performance, and maintainability.",
  }],
});
```

## System Message

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  systemMessage: {
    content: "You are a helpful assistant for our engineering team. Always be concise.",
  },
});
```

## External CLI Server

Run CLI in server mode separately, then connect:

```bash
copilot --server --port 4321
```

```typescript
const client = new CopilotClient({ cliUrl: "localhost:4321" });
```

When `cliUrl` is provided, the SDK will not spawn or manage a CLI process.

## Session Persistence

```typescript
// Create with custom ID
const session = await client.createSession({
  sessionId: "user-123-conversation",
  model: "gpt-4.1",
});

// Resume later
const session = await client.resumeSession("user-123-conversation");

// List and delete
const sessions = await client.listSessions();
await client.deleteSession("old-session-id");
```

## File Attachments

```typescript
await session.send({
  prompt: "Analyze this file",
  attachments: [{
    type: "file",
    path: "./data.csv",
    displayName: "Sales Data",
  }],
});
```

## Event Types

| Event | Description |
|-------|-------------|
| `user.message` | User input added |
| `assistant.message` | Complete model response |
| `assistant.message_delta` | Streaming response chunk |
| `assistant.reasoning` | Model reasoning (model-dependent) |
| `assistant.reasoning_delta` | Streaming reasoning chunk |
| `tool.execution_start` | Tool invocation started |
| `tool.execution_complete` | Tool execution finished |
| `session.idle` | No active processing |
| `session.error` | Error occurred |

## Client Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `cliPath` | Path to Copilot CLI executable | System PATH |
| `cliUrl` | Connect to existing server | None |
| `port` | Server communication port | Random |
| `useStdio` | Use stdio transport instead of TCP | true |
| `logLevel` | Logging verbosity | "info" |
| `autoStart` | Launch server automatically | true |
| `autoRestart` | Restart on crashes | true |
| `cwd` | Working directory for CLI process | Inherited |

## Session Configuration

| Option | Description |
|--------|-------------|
| `model` | LLM to use ("gpt-4.1", "claude-sonnet-4.5", etc.) |
| `sessionId` | Custom session identifier |
| `tools` | Custom tool definitions |
| `mcpServers` | MCP server connections |
| `customAgents` | Custom agent personas |
| `systemMessage` | Override default system prompt |
| `streaming` | Enable incremental response chunks |
| `availableTools` | Whitelist of permitted tools |
| `excludedTools` | Blacklist of disabled tools |

## GHO Work Integration Notes

- Our `IAgentService` wraps the SDK — see `packages/agent/`
- The Agent Host utility process runs the SDK in isolation via `utilityProcess.fork()`
- MessagePort bridges SDK events to the renderer (see `packages/electron/src/agentHost/`)
- Current implementation uses `MockCopilotSDK` — replace with real SDK in Phase 2
- SDK supports MCP servers natively — wire to our `packages/connectors/` MCP manager

## Best Practices

1. Always call `client.stop()` in try-finally
2. Use `sendAndWait` with timeout for long operations
3. Enable streaming for better UX
4. Use custom session IDs for conversation persistence
5. Write descriptive tool names and descriptions
6. Use available models query: `const models = await client.getModels()`
