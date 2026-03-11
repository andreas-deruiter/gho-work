# Phase 2: Agent Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Copilot SDK to the multi-process architecture, build streaming chat UI, and persist conversations to SQLite.

**Architecture:** Thin CopilotClient wrapper in Agent Host utility process, event bridging via AsyncQueue to renderer, IConversationService for SQLite persistence. SDK handles all tool execution natively — no permission wrapping, no tool re-registration.

**Tech Stack:** TypeScript, Electron (utility process), `@github/copilot-sdk`, `better-sqlite3`, `marked`, `dompurify`, Vitest

---

## Chunk 1: Agent Package Core (Tasks 1–5)

### Task 1: AsyncQueue Utility

**Files:**
- Create: `packages/agent/src/common/asyncQueue.ts`
- Test: `packages/agent/src/__tests__/asyncQueue.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent/src/__tests__/asyncQueue.test.ts
import { describe, it, expect } from 'vitest';
import { AsyncQueue } from '../common/asyncQueue.js';

describe('AsyncQueue', () => {
  it('yields items pushed before iteration', async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.end();

    const results: number[] = [];
    for await (const item of queue) {
      results.push(item);
    }
    expect(results).toEqual([1, 2]);
  });

  it('yields items pushed during iteration', async () => {
    const queue = new AsyncQueue<number>();
    const results: number[] = [];

    const consumer = (async () => {
      for await (const item of queue) {
        results.push(item);
      }
    })();

    queue.push(10);
    queue.push(20);
    queue.end();

    await consumer;
    expect(results).toEqual([10, 20]);
  });

  it('throws error in consumer when error is pushed', async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.error(new Error('test error'));

    const results: number[] = [];
    await expect(async () => {
      for await (const item of queue) {
        results.push(item);
      }
    }).rejects.toThrow('test error');
    expect(results).toEqual([1]);
  });

  it('returns immediately when already ended', async () => {
    const queue = new AsyncQueue<string>();
    queue.end();

    const results: string[] = [];
    for await (const item of queue) {
      results.push(item);
    }
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/src/__tests__/asyncQueue.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/agent/src/common/asyncQueue.ts
/**
 * AsyncQueue — bridges callback-based SDK events to AsyncIterable.
 * Push items from callbacks, consume via for-await-of.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private _buffer: T[] = [];
  private _resolve: ((value: IteratorResult<T>) => void) | null = null;
  private _done = false;
  private _error: Error | null = null;

  push(item: T): void {
    if (this._done) {
      return;
    }
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve({ value: item, done: false });
    } else {
      this._buffer.push(item);
    }
  }

  error(err: Error): void {
    this._error = err;
    this._done = true;
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      // The next() caller will check _error and throw
      resolve({ value: undefined as T, done: true });
    }
  }

  end(): void {
    this._done = true;
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve({ value: undefined as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this._buffer.length > 0) {
          return Promise.resolve({ value: this._buffer.shift()!, done: false });
        }
        if (this._error) {
          return Promise.reject(this._error);
        }
        if (this._done) {
          return Promise.resolve({ value: undefined as T, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this._resolve = (result) => {
            if (this._error) {
              // Error was set between await and resolve
              resolve({ value: undefined as T, done: true });
              throw this._error;
            }
            resolve(result);
          };
        });
      },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/agent/src/__tests__/asyncQueue.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/common/asyncQueue.ts packages/agent/src/__tests__/asyncQueue.test.ts
git commit -m "feat(agent): add AsyncQueue for SDK event bridging"
```

---

### Task 2: Split interfaces.ts into common/ modules

**Files:**
- Create: `packages/agent/src/common/copilotSDK.ts`
- Create: `packages/agent/src/common/agent.ts`
- Create: `packages/agent/src/common/conversation.ts`
- Create: `packages/agent/src/common/types.ts`
- Delete: `packages/agent/src/interfaces.ts`
- Modify: `packages/agent/src/index.ts`

Phase 2 rewrites ICopilotSDK to match the real `@github/copilot-sdk` API (ISDKSession object model) and removes IPermissionService. IMCPManager stays temporarily in types.ts.

- [ ] **Step 1: Create `common/copilotSDK.ts` — ICopilotSDK + ISDKSession interfaces**

```typescript
// packages/agent/src/common/copilotSDK.ts
import { createServiceIdentifier } from '@gho-work/base';
import type { SessionConfig, SendOptions, SessionEvent, SDKMessage, SessionMetadata, MCPServerConfig } from './types.js';

/**
 * Thin wrapper around CopilotClient from @github/copilot-sdk.
 * Manages CLI server lifecycle and session creation.
 */
export interface ICopilotSDK {
  start(): Promise<void>;
  stop(): Promise<void>;
  createSession(config: SessionConfig): Promise<ISDKSession>;
  resumeSession(sessionId: string): Promise<ISDKSession>;
  listSessions(): Promise<SessionMetadata[]>;
  deleteSession(sessionId: string): Promise<void>;
  ping(): Promise<string>;
}

export const ICopilotSDK = createServiceIdentifier<ICopilotSDK>('ICopilotSDK');

/**
 * A single SDK session — wraps the real SDK session object.
 * Supports streaming events, sending prompts, and aborting.
 */
export interface ISDKSession {
  readonly sessionId: string;
  send(options: SendOptions): Promise<string>;
  sendAndWait(options: SendOptions, timeout?: number): Promise<SDKMessage>;
  abort(): Promise<void>;
  on(event: string, handler: (event: SessionEvent) => void): () => void;
  on(handler: (event: SessionEvent) => void): () => void;
  getMessages(): Promise<SDKMessage[]>;
  disconnect(): Promise<void>;
}
```

- [ ] **Step 2: Create `common/agent.ts` — IAgentService interface**

```typescript
// packages/agent/src/common/agent.ts
import { createServiceIdentifier } from '@gho-work/base';
import type { AgentContext, AgentEvent } from '@gho-work/base';

/**
 * Orchestrates task execution: creates SDK sessions, injects context,
 * bridges events to AsyncIterable for the renderer.
 */
export interface IAgentService {
  executeTask(prompt: string, context: AgentContext): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
  getActiveTaskId(): string | null;
}

export const IAgentService = createServiceIdentifier<IAgentService>('IAgentService');
```

- [ ] **Step 3: Create `common/conversation.ts` — IConversationService interface**

```typescript
// packages/agent/src/common/conversation.ts
import { createServiceIdentifier } from '@gho-work/base';
import type { Conversation, Message, ToolCall } from '@gho-work/base';

/**
 * Encapsulates conversation persistence to SQLite.
 * Avoids scattering DB calls across services.
 */
export interface IConversationService {
  listConversations(): Conversation[];
  getConversation(id: string): Conversation | undefined;
  createConversation(model: string): Conversation;
  renameConversation(id: string, title: string): void;
  deleteConversation(id: string): void;
  archiveConversation(id: string): void;
  addMessage(conversationId: string, message: Omit<Message, 'id'>): Message;
  getMessages(conversationId: string): Message[];
  addToolCall(messageId: string, conversationId: string, toolCall: Omit<ToolCall, 'id'>): ToolCall;
  updateToolCall(id: string, update: Partial<Pick<ToolCall, 'result' | 'status' | 'durationMs'>>): void;
  getToolCalls(conversationId: string): ToolCall[];
}

export const IConversationService = createServiceIdentifier<IConversationService>('IConversationService');
```

- [ ] **Step 4: Create `common/types.ts` — SessionConfig, SendOptions, SDK types, IMCPManager**

```typescript
// packages/agent/src/common/types.ts
import { createServiceIdentifier } from '@gho-work/base';
import type { ConnectorConfig } from '@gho-work/base';

// --- SDK session types ---

export interface SessionConfig {
  model: string;
  sessionId?: string;
  systemMessage?: { content: string };
  mcpServers?: MCPServerConfig[];
  streaming?: boolean;
}

export interface SendOptions {
  prompt: string;
  attachments?: Array<{ type: 'file'; path: string; displayName?: string }>;
  mode?: 'enqueue' | 'immediate';
}

export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'streamable_http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface SessionMetadata {
  sessionId: string;
  model: string;
  createdAt: number;
}

export interface SessionEvent {
  type: string;
  [key: string]: unknown;
}

export interface SDKMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// --- IMCPManager (temporary — moves to packages/connectors in Phase 3) ---

export interface IMCPManager {
  connect(config: ConnectorConfig): Promise<void>;
  disconnect(connectorId: string): Promise<void>;
  listTools(connectorId: string): Promise<Array<{ name: string; description: string }>>;
  callTool(connectorId: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export const IMCPManager = createServiceIdentifier<IMCPManager>('IMCPManager');
```

- [ ] **Step 5: Delete `interfaces.ts` and update `index.ts`**

Delete `packages/agent/src/interfaces.ts`.

Update barrel:
```typescript
// packages/agent/src/index.ts
export * from './common/copilotSDK.js';
export * from './common/agent.js';
export * from './common/conversation.js';
export * from './common/types.js';
export * from './common/asyncQueue.js';
```

Note: `mock-agent.ts` will be deleted and replaced by `node/mockCopilotSDK.ts` in Task 4. Until then, the barrel temporarily does not re-export the mock. The mock import in `mainProcess.ts` will be updated in Task 9.

- [ ] **Step 6: Update `packages/base/src/common/types.ts` — remove `permission_request` from AgentEvent**

Remove the `permission_request` variant from the `AgentEvent` union:

```typescript
export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_call_start'; toolCall: Omit<ToolCall, 'result' | 'durationMs'> }
  | { type: 'tool_call_result'; toolCallId: string; result: ToolResult }
  | { type: 'error'; error: string }
  | { type: 'done'; messageId: string };
```

- [ ] **Step 7: Run build and tests**

Run: `npx turbo build && npx vitest run --changed`
Expected: Build passes, all tests pass. Some existing tests may need updating if they reference `IPermissionService` or `permission_request`.

- [ ] **Step 8: Fix any broken imports**

Update any files that imported from `@gho-work/agent` and referenced `IPermissionService` — remove those imports. The `mainProcess.ts` still imports `MockCopilotSDK` and `MockAgentService` which are not yet available from the new barrel — this will be fixed in Task 9. For now, ensure the build compiles by temporarily keeping mock-agent.ts and adding it to index.ts if needed, or by commenting out the mainProcess import.

- [ ] **Step 9: Commit**

```bash
git add packages/agent/src/common/ packages/agent/src/index.ts packages/base/src/common/types.ts
git rm packages/agent/src/interfaces.ts
git commit -m "refactor(agent): split interfaces into common/ modules, remove IPermissionService"
```

---

### Task 3: IPC Channel Additions + Preload Updates

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts`
- Modify: `packages/electron/src/preload/preload.ts`

- [ ] **Step 1: Add new IPC channels and schemas**

Add to `IPC_CHANNELS` in `packages/platform/src/ipc/common/ipc.ts`:

```typescript
CONVERSATION_GET: 'conversation:get',
CONVERSATION_DELETE: 'conversation:delete',
CONVERSATION_RENAME: 'conversation:rename',
MODEL_LIST: 'model:list',
MODEL_SELECT: 'model:select',
```

Add schemas:

```typescript
export const ConversationGetRequestSchema = z.object({
  conversationId: z.string(),
});
export type ConversationGetRequest = z.infer<typeof ConversationGetRequestSchema>;

export const ConversationDeleteRequestSchema = z.object({
  conversationId: z.string(),
});
export type ConversationDeleteRequest = z.infer<typeof ConversationDeleteRequestSchema>;

export const ConversationRenameRequestSchema = z.object({
  conversationId: z.string(),
  title: z.string(),
});
export type ConversationRenameRequest = z.infer<typeof ConversationRenameRequestSchema>;

export const ModelListResponseSchema = z.object({
  models: z.array(z.object({
    id: z.string(),
    name: z.string(),
    provider: z.string(),
  })),
});
export type ModelListResponse = z.infer<typeof ModelListResponseSchema>;

export const ModelSelectRequestSchema = z.object({
  modelId: z.string(),
});
export type ModelSelectRequest = z.infer<typeof ModelSelectRequestSchema>;
```

Remove the `permission_request` variant from `AgentEventSchema`:

```typescript
export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({ type: z.literal('text_delta'), content: z.string() }),
  z.object({ type: z.literal('thinking'), content: z.string() }),
  z.object({ type: z.literal('tool_call_start'), toolCall: ToolCallPartialSchema }),
  z.object({ type: z.literal('tool_call_result'), toolCallId: z.string(), result: ToolResultSchema }),
  z.object({ type: z.literal('error'), error: z.string() }),
  z.object({ type: z.literal('done'), messageId: z.string() }),
]);
```

- [ ] **Step 2: Update preload whitelist**

In `packages/electron/src/preload/preload.ts`, add to `ALLOWED_INVOKE_CHANNELS`:

```typescript
IPC_CHANNELS.CONVERSATION_GET,
IPC_CHANNELS.CONVERSATION_DELETE,
IPC_CHANNELS.CONVERSATION_RENAME,
IPC_CHANNELS.MODEL_LIST,
IPC_CHANNELS.MODEL_SELECT,
```

- [ ] **Step 3: Run build and tests**

Run: `npx turbo build && npx vitest run --changed`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts packages/electron/src/preload/preload.ts
git commit -m "feat(platform): add conversation CRUD and model IPC channels"
```

---

### Task 4: MockCopilotSDK — Rewrite for New Interfaces

**Files:**
- Create: `packages/agent/src/node/mockCopilotSDK.ts`
- Delete: `packages/agent/src/mock-agent.ts`
- Modify: `packages/agent/src/index.ts`
- Test: `packages/agent/src/__tests__/mockCopilotSDK.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/agent/src/__tests__/mockCopilotSDK.test.ts
import { describe, it, expect } from 'vitest';
import { MockCopilotSDK } from '../node/mockCopilotSDK.js';

describe('MockCopilotSDK', () => {
  it('starts and pings', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();
    const result = await sdk.ping();
    expect(result).toBe('pong');
    await sdk.stop();
  });

  it('creates a session and receives events', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    const session = await sdk.createSession({ model: 'gpt-4o' });
    expect(session.sessionId).toBeTruthy();

    const events: Array<{ type: string }> = [];
    session.on((event) => {
      events.push(event);
    });

    await session.send({ prompt: 'Hello' });

    // Wait for events to arrive (mock uses setTimeout)
    await new Promise((r) => setTimeout(r, 500));

    expect(events.length).toBeGreaterThan(0);
    const types = events.map((e) => e.type);
    expect(types).toContain('assistant.message_delta');

    await session.disconnect();
    await sdk.stop();
  });

  it('aborts a session', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    const session = await sdk.createSession({ model: 'gpt-4o' });
    await session.send({ prompt: 'Hello' });
    await session.abort();
    await session.disconnect();
    await sdk.stop();
  });

  it('lists and deletes sessions', async () => {
    const sdk = new MockCopilotSDK();
    await sdk.start();

    const session = await sdk.createSession({ model: 'gpt-4o' });
    const list = await sdk.listSessions();
    expect(list.some((s) => s.sessionId === session.sessionId)).toBe(true);

    await sdk.deleteSession(session.sessionId);
    const list2 = await sdk.listSessions();
    expect(list2.some((s) => s.sessionId === session.sessionId)).toBe(false);

    await sdk.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/src/__tests__/mockCopilotSDK.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/agent/src/node/mockCopilotSDK.ts
/**
 * Mock Copilot SDK — implements ICopilotSDK + ISDKSession for development/testing.
 * Simulates streaming responses and tool calls without a real CLI server.
 */
import { generateUUID } from '@gho-work/base';
import type { ICopilotSDK, ISDKSession } from '../common/copilotSDK.js';
import type { SessionConfig, SendOptions, SessionEvent, SDKMessage, SessionMetadata } from '../common/types.js';

class MockSDKSession implements ISDKSession {
  readonly sessionId: string;
  private _handlers: Array<(event: SessionEvent) => void> = [];
  private _abortController = new AbortController();
  private _messages: SDKMessage[] = [];

  constructor(
    sessionId: string,
    private readonly _config: SessionConfig,
  ) {
    this.sessionId = sessionId;
  }

  async send(options: SendOptions): Promise<string> {
    const messageId = generateUUID();
    this._messages.push({ id: generateUUID(), role: 'user', content: options.prompt });

    // Simulate async response generation
    this._simulateResponse(messageId, options.prompt);
    return messageId;
  }

  async sendAndWait(options: SendOptions, timeout = 30000): Promise<SDKMessage> {
    return new Promise<SDKMessage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
      const unsub = this.on('session.idle', () => {
        clearTimeout(timer);
        unsub();
        const last = this._messages[this._messages.length - 1];
        resolve(last);
      });
      this.send(options);
    });
  }

  async abort(): Promise<void> {
    this._abortController.abort();
    this._abortController = new AbortController();
  }

  on(event: string, handler: (event: SessionEvent) => void): () => void;
  on(handler: (event: SessionEvent) => void): () => void;
  on(eventOrHandler: string | ((event: SessionEvent) => void), handler?: (event: SessionEvent) => void): () => void {
    const fn = typeof eventOrHandler === 'function' ? eventOrHandler : handler!;
    const eventFilter = typeof eventOrHandler === 'string' ? eventOrHandler : null;

    const wrapped = (event: SessionEvent) => {
      if (!eventFilter || event.type === eventFilter) {
        fn(event);
      }
    };

    this._handlers.push(wrapped);
    return () => {
      this._handlers = this._handlers.filter((h) => h !== wrapped);
    };
  }

  async getMessages(): Promise<SDKMessage[]> {
    return [...this._messages];
  }

  async disconnect(): Promise<void> {
    this._handlers = [];
  }

  private _emit(event: SessionEvent): void {
    for (const handler of this._handlers) {
      try {
        handler(event);
      } catch (e) {
        console.error('Error in mock session handler:', e);
      }
    }
  }

  private async _simulateResponse(messageId: string, prompt: string): Promise<void> {
    const signal = this._abortController.signal;
    const response = this._generateResponse(prompt);
    const words = response.split(' ');

    // Simulate thinking
    this._emit({ type: 'assistant.reasoning_delta', content: `Analyzing: "${prompt.slice(0, 50)}"` });
    await this._delay(100, signal);
    if (signal.aborted) { return; }

    // Simulate tool call for certain prompts
    if (prompt.toLowerCase().includes('file') || prompt.toLowerCase().includes('search')) {
      const toolCallId = generateUUID();
      this._emit({ type: 'tool.execution_start', toolCallId, toolName: 'Read', serverName: 'built-in', arguments: { path: './example.md' } });
      await this._delay(200, signal);
      if (signal.aborted) { return; }
      this._emit({ type: 'tool.execution_complete', toolCallId, result: { success: true, content: '# Example\nMock file content.' } });
      await this._delay(100, signal);
      if (signal.aborted) { return; }
    }

    // Stream text deltas
    for (const word of words) {
      if (signal.aborted) { return; }
      this._emit({ type: 'assistant.message_delta', content: word + ' ' });
      await this._delay(20 + Math.random() * 30, signal);
    }

    // Complete message
    this._messages.push({ id: messageId, role: 'assistant', content: response });
    this._emit({ type: 'assistant.message', content: response, messageId });
    this._emit({ type: 'session.idle', messageId });
  }

  private _generateResponse(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('email') || lower.includes('draft')) {
      return 'I can help you draft that email. Here is a suggested draft:\n\n**Subject:** Follow-up on our discussion\n\nHi team,\n\nI wanted to follow up on the points we discussed. Let me know if you have any questions.\n\nBest regards';
    }
    if (lower.includes('data') || lower.includes('analyze')) {
      return 'I have analyzed the data. Key findings:\n\n1. **Revenue** increased 12% MoM\n2. **Active users** grew to 15,234\n3. **Churn rate** decreased to 2.1%\n\nWould you like a detailed report?';
    }
    return `I understand you want help with: "${input}"\n\nI am a mock agent in GHO Work. In production, the GitHub Copilot SDK processes requests with real LLM capabilities, MCP connectors, and native tool execution.`;
  }

  private _delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) { resolve(); return; }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}

export class MockCopilotSDK implements ICopilotSDK {
  private _sessions = new Map<string, MockSDKSession>();
  private _started = false;

  async start(): Promise<void> {
    this._started = true;
  }

  async stop(): Promise<void> {
    for (const session of this._sessions.values()) {
      await session.disconnect();
    }
    this._sessions.clear();
    this._started = false;
  }

  async createSession(config: SessionConfig): Promise<ISDKSession> {
    const sessionId = config.sessionId ?? generateUUID();
    const session = new MockSDKSession(sessionId, config);
    this._sessions.set(sessionId, session);
    return session;
  }

  async resumeSession(sessionId: string): Promise<ISDKSession> {
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  async listSessions(): Promise<SessionMetadata[]> {
    return Array.from(this._sessions.entries()).map(([id]) => ({
      sessionId: id,
      model: 'mock',
      createdAt: Date.now(),
    }));
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (session) {
      await session.disconnect();
      this._sessions.delete(sessionId);
    }
  }

  async ping(): Promise<string> {
    return 'pong';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/agent/src/__tests__/mockCopilotSDK.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Delete old mock-agent.ts and update barrel**

Delete `packages/agent/src/mock-agent.ts`.

Update `packages/agent/src/index.ts`:
```typescript
export * from './common/copilotSDK.js';
export * from './common/agent.js';
export * from './common/conversation.js';
export * from './common/types.js';
export * from './common/asyncQueue.js';
export * from './node/mockCopilotSDK.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/node/mockCopilotSDK.ts packages/agent/src/__tests__/mockCopilotSDK.test.ts packages/agent/src/index.ts
git rm packages/agent/src/mock-agent.ts
git commit -m "feat(agent): rewrite mock SDK for Phase 2 interfaces"
```

---

### Task 5: ConversationService Implementation

**Files:**
- Create: `packages/agent/src/node/conversationServiceImpl.ts`
- Test: `packages/agent/src/__tests__/conversationService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent/src/__tests__/conversationService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { configurePragmas, migrateDatabase } from '@gho-work/platform';
import { WORKSPACE_MIGRATIONS } from '@gho-work/platform';
import { ConversationServiceImpl } from '../node/conversationServiceImpl.js';

describe('ConversationServiceImpl', () => {
  let db: Database.Database;
  let service: ConversationServiceImpl;

  beforeEach(() => {
    db = new Database(':memory:');
    configurePragmas(db);
    migrateDatabase(db, WORKSPACE_MIGRATIONS);
    service = new ConversationServiceImpl(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates and lists conversations', () => {
    const conv = service.createConversation('gpt-4o');
    expect(conv.id).toBeTruthy();
    expect(conv.model).toBe('gpt-4o');
    expect(conv.status).toBe('active');

    const list = service.listConversations();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(conv.id);
  });

  it('gets a conversation by id', () => {
    const conv = service.createConversation('gpt-4o');
    const found = service.getConversation(conv.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(conv.id);
  });

  it('renames a conversation', () => {
    const conv = service.createConversation('gpt-4o');
    service.renameConversation(conv.id, 'My Chat');
    const found = service.getConversation(conv.id);
    expect(found!.title).toBe('My Chat');
  });

  it('deletes a conversation and its messages', () => {
    const conv = service.createConversation('gpt-4o');
    service.addMessage(conv.id, {
      conversationId: conv.id,
      role: 'user',
      content: 'Hello',
      toolCalls: [],
      timestamp: Date.now(),
    });
    service.deleteConversation(conv.id);

    expect(service.getConversation(conv.id)).toBeUndefined();
    expect(service.getMessages(conv.id)).toHaveLength(0);
  });

  it('archives a conversation', () => {
    const conv = service.createConversation('gpt-4o');
    service.archiveConversation(conv.id);
    const found = service.getConversation(conv.id);
    expect(found!.status).toBe('archived');
  });

  it('adds and retrieves messages', () => {
    const conv = service.createConversation('gpt-4o');
    const msg = service.addMessage(conv.id, {
      conversationId: conv.id,
      role: 'user',
      content: 'Hello world',
      toolCalls: [],
      timestamp: Date.now(),
    });
    expect(msg.id).toBeTruthy();

    const messages = service.getMessages(conv.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello world');
    expect(messages[0].role).toBe('user');
  });

  it('adds and updates tool calls', () => {
    const conv = service.createConversation('gpt-4o');
    const msg = service.addMessage(conv.id, {
      conversationId: conv.id,
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: Date.now(),
    });

    const tc = service.addToolCall(msg.id, conv.id, {
      id: '',
      messageId: msg.id,
      toolName: 'Read',
      serverName: 'built-in',
      arguments: { path: './test.md' },
      result: null,
      permission: 'allow_once',
      status: 'pending',
      durationMs: null,
      timestamp: Date.now(),
    });
    expect(tc.id).toBeTruthy();
    expect(tc.status).toBe('pending');

    service.updateToolCall(tc.id, {
      status: 'completed',
      result: { success: true, content: 'file contents' },
      durationMs: 150,
    });

    const calls = service.getToolCalls(conv.id);
    expect(calls).toHaveLength(1);
    expect(calls[0].status).toBe('completed');
    expect(calls[0].durationMs).toBe(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/src/__tests__/conversationService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/agent/src/node/conversationServiceImpl.ts
/**
 * ConversationService — SQLite persistence for conversations, messages, and tool calls.
 * Uses the workspace database from SqliteStorageService.
 */
import type Database from 'better-sqlite3';
import { generateUUID } from '@gho-work/base';
import type { Conversation, Message, ToolCall, ToolResult } from '@gho-work/base';
import type { IConversationService } from '../common/conversation.js';

export class ConversationServiceImpl implements IConversationService {
  constructor(private readonly _db: Database.Database) {}

  listConversations(): Conversation[] {
    const rows = this._db
      .prepare('SELECT * FROM conversations WHERE status = ? ORDER BY updated_at DESC')
      .all('active') as Array<Record<string, unknown>>;
    return rows.map(rowToConversation);
  }

  getConversation(id: string): Conversation | undefined {
    const row = this._db
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToConversation(row) : undefined;
  }

  createConversation(model: string): Conversation {
    const id = generateUUID();
    const now = Date.now();
    this._db
      .prepare('INSERT INTO conversations (id, title, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, 'New Conversation', model, 'active', now, now);
    return { id, workspaceId: '', title: 'New Conversation', model, status: 'active', createdAt: now, updatedAt: now };
  }

  renameConversation(id: string, title: string): void {
    this._db
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, Date.now(), id);
  }

  deleteConversation(id: string): void {
    this._db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  archiveConversation(id: string): void {
    this._db
      .prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?')
      .run('archived', Date.now(), id);
  }

  addMessage(conversationId: string, message: Omit<Message, 'id'>): Message {
    const id = generateUUID();
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    this._db
      .prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, conversationId, message.role, content, message.timestamp);
    // Update conversation's updated_at
    this._db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(message.timestamp, conversationId);
    return { ...message, id } as Message;
  }

  getMessages(conversationId: string): Message[] {
    const rows = this._db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage);
  }

  addToolCall(messageId: string, conversationId: string, toolCall: Omit<ToolCall, 'id'>): ToolCall {
    const id = generateUUID();
    this._db
      .prepare(`INSERT INTO tool_calls (id, message_id, conversation_id, tool_name, server_name, arguments, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, messageId, conversationId, toolCall.toolName, toolCall.serverName, JSON.stringify(toolCall.arguments), toolCall.status, toolCall.timestamp);
    return { ...toolCall, id } as ToolCall;
  }

  updateToolCall(id: string, update: Partial<Pick<ToolCall, 'result' | 'status' | 'durationMs'>>): void {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (update.status !== undefined) {
      sets.push('status = ?');
      values.push(update.status);
    }
    if (update.result !== undefined) {
      sets.push('result = ?');
      values.push(JSON.stringify(update.result));
    }
    if (update.durationMs !== undefined) {
      sets.push('duration_ms = ?');
      values.push(update.durationMs);
    }
    if (sets.length > 0) {
      sets.push('completed_at = ?');
      values.push(Date.now());
      values.push(id);
      this._db.prepare(`UPDATE tool_calls SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  getToolCalls(conversationId: string): ToolCall[] {
    const rows = this._db
      .prepare('SELECT * FROM tool_calls WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as Array<Record<string, unknown>>;
    return rows.map(rowToToolCall);
  }
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    workspaceId: '',
    title: row.title as string,
    model: row.model as string,
    status: row.status as 'active' | 'archived',
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    role: row.role as Message['role'],
    content: row.content as string,
    toolCalls: [],
    timestamp: row.created_at as number,
  };
}

function rowToToolCall(row: Record<string, unknown>): ToolCall {
  return {
    id: row.id as string,
    messageId: row.message_id as string,
    toolName: row.tool_name as string,
    serverName: row.server_name as string,
    arguments: JSON.parse((row.arguments as string) || '{}'),
    result: row.result ? JSON.parse(row.result as string) as ToolResult : null,
    permission: 'allow_once',
    status: row.status as ToolCall['status'],
    durationMs: (row.duration_ms as number) ?? null,
    timestamp: row.created_at as number,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/agent/src/__tests__/conversationService.test.ts`
Expected: 7 tests PASS

- [ ] **Step 5: Add to barrel export**

Add to `packages/agent/src/index.ts`:
```typescript
export * from './node/conversationServiceImpl.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/node/conversationServiceImpl.ts packages/agent/src/__tests__/conversationService.test.ts packages/agent/src/index.ts
git commit -m "feat(agent): add ConversationService with SQLite persistence"
```

---

## Chunk 2: Agent Service, Chat UI, and Wiring (Tasks 6–10)

### Task 6: AgentService Implementation

**Files:**
- Create: `packages/agent/src/node/agentServiceImpl.ts`
- Test: `packages/agent/src/__tests__/agentService.test.ts`

- [ ] **Step 1: Write the failing test**

See `packages/agent/src/__tests__/agentService.test.ts` — tests for:
- Streaming events from executeTask (text_delta + done events)
- Active task ID tracking (non-null during execution, null after)
- Cancel terminates iteration without hanging

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/src/__tests__/agentService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

`packages/agent/src/node/agentServiceImpl.ts`:
- Constructor takes ICopilotSDK and optional context file reader
- `executeTask()`: builds system message from context files, creates SDK session, maps SDK events to AgentEvents via AsyncQueue
- `cancelTask()`: calls session.abort()
- `getActiveTaskId()`: returns current task ID or null
- Event mapping: `assistant.message_delta` → `text_delta`, `assistant.message` → `text`, `assistant.reasoning_delta` → `thinking`, `tool.execution_start` → `tool_call_start`, `tool.execution_complete` → `tool_call_result`, `session.idle` → `done`, `session.error` → `error`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/agent/src/__tests__/agentService.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Add to barrel and commit**

```bash
git add packages/agent/src/node/agentServiceImpl.ts packages/agent/src/__tests__/agentService.test.ts packages/agent/src/index.ts
git commit -m "feat(agent): add AgentServiceImpl with SDK event bridging"
```

---

### Task 7: CopilotSDK Real Implementation (Stub)

**Files:**
- Create: `packages/agent/src/node/copilotSDKImpl.ts`

Stub that throws "Not implemented" — will be filled when `@github/copilot-sdk` is installed. Use MockCopilotSDK for development.

- [ ] **Step 1: Write the stub implementing ICopilotSDK**

All methods throw `Error('CopilotSDKImpl: @github/copilot-sdk not yet installed. Use MockCopilotSDK.')`.

- [ ] **Step 2: Add to barrel and commit**

```bash
git add packages/agent/src/node/copilotSDKImpl.ts packages/agent/src/index.ts
git commit -m "feat(agent): add CopilotSDKImpl stub for real SDK integration"
```

---

### Task 8: Chat UI Enhancements

**Files:**
- Modify: `packages/ui/src/browser/chatPanel.ts`
- Create: `packages/ui/src/browser/conversationList.ts`
- Create: `packages/ui/src/browser/modelSelector.ts`

- [ ] **Step 1: Install marked and dompurify**

Run: `npm install marked dompurify --workspace=packages/ui && npm install @types/dompurify --save-dev --workspace=packages/ui`

- [ ] **Step 2: Create ConversationListPanel**

`packages/ui/src/browser/conversationList.ts`:
- Extends Disposable, takes IIPCRenderer
- Renders "+ New Conversation" button and conversation list
- Emits `onDidSelectConversation` (fires conversation ID)
- Emits `onDidRequestNewConversation`
- `refresh()` loads conversations via IPC

- [ ] **Step 3: Create ModelSelector**

`packages/ui/src/browser/modelSelector.ts`:
- Extends Disposable
- Renders `<select>` dropdown with model options
- Emits `onDidSelectModel` (fires model ID)
- `setModels()` updates available models

- [ ] **Step 4: Enhance ChatPanel**

Key changes to `packages/ui/src/browser/chatPanel.ts`:
- Replace regex markdown with `marked.parse()` + `DOMPurify.sanitize()` (XSS prevention)
- Add cancel/stop button that calls `session.abort()` via IPC
- Add `conversationId` and `model` properties
- Add `loadConversation()` for switching conversations
- Add `onDidSendMessage` event
- Tool call matching by ID (not just "last in array")

- [ ] **Step 5: Update UI barrel**

Add conversationList and modelSelector exports to `packages/ui/src/index.ts`.

- [ ] **Step 6: Run build and commit**

```bash
npx turbo build
git add packages/ui/ package.json
git commit -m "feat(ui): enhance chat with marked/DOMPurify, cancel button, conversation list, model selector"
```

---

### Task 9: Agent Host + Main Process Wiring

**Files:**
- Modify: `packages/electron/src/agentHost/agentHostMain.ts`
- Modify: `packages/electron/src/main/mainProcess.ts`

- [ ] **Step 1: Rewrite agentHostMain.ts**

Wire MockCopilotSDK + AgentServiceImpl in the utility process. Handle `agent:send-message` by streaming AgentEvents back via `protocol.send()`. Handle `agent:cancel` by calling `agentService.cancelTask()`.

- [ ] **Step 2: Update mainProcess.ts**

- Replace MockCopilotSDK/MockAgentService with ConversationServiceImpl for conversation CRUD
- Add IPC handlers: CONVERSATION_GET, CONVERSATION_DELETE, CONVERSATION_RENAME, MODEL_LIST, MODEL_SELECT
- Agent send/cancel become fallback handlers (renderer talks to Agent Host directly via MessagePort)
- Signature changes: `createMainProcess(mainWindow, storageService, workspaceId)` — needs SqliteStorageService for workspace DB access

- [ ] **Step 3: Run build and commit**

```bash
npx turbo build
git add packages/electron/src/
git commit -m "feat(electron): wire Agent Host with SDK services, add conversation IPC handlers"
```

---

### Task 10: Integration Tests

**Files:**
- Create: `packages/agent/src/__tests__/agentIntegration.test.ts`

- [ ] **Step 1: Write integration test**

Tests for:
- Full chat flow: create conversation → send message → collect streaming events → persist assistant message → verify 2 messages in DB
- Tool call flow: send "search for files" → verify tool_call_start events → persist tool calls → verify in DB

- [ ] **Step 2: Run all tests**

Run: `npx vitest run packages/agent/src/__tests__/`
Expected: All tests PASS

- [ ] **Step 3: Run full build and lint**

Run: `npx turbo lint && npx turbo build && npx vitest run`
Expected: All green

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/__tests__/agentIntegration.test.ts
git commit -m "test(agent): add integration tests for full agent + conversation flow"
```

---

## Post-Implementation Checklist

After all 10 tasks are complete:

- [ ] Run `npx turbo lint && npx turbo build && npx vitest run` — all green
- [ ] Run `npm run desktop:dev` — app launches, chat works with mock agent
- [ ] Verify: type a message → streaming response → thinking clears → cancel works
- [ ] Verify: conversation list shows conversations, new conversation button works
- [ ] Verify: no `IPermissionService` or `permission_request` references remain
- [ ] Update `docs/IMPLEMENTATION_PLAN.md` — check off Phase 2 deliverables
- [ ] Final commit with all deliverables verified
