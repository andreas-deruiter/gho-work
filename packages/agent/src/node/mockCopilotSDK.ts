/**
 * Mock implementation of ICopilotSDK and ISDKSession for testing and development.
 * Simulates the Copilot SDK agent loop with streaming events and fake tool calls.
 * Events use the `data` payload shape matching the real @github/copilot-sdk.
 */
import { generateUUID } from '@gho-work/base';
import type { ICopilotSDK, ISDKSession, SDKQuotaResult } from '../common/copilotSDK.js';
import type { SessionConfig, MessageOptions, SessionEvent, SessionMetadata, ModelInfo, PingResponse, ToolDefinition } from '../common/types.js';

type EventHandler = (event: SessionEvent) => void;

interface StoredHandler {
  filter: string | null;
  handler: EventHandler;
}

class MockSDKSession implements ISDKSession {
  readonly sessionId: string;
  private _model: string;
  private _tools: ToolDefinition[];
  readonly createdAt: number;

  private messages: Array<{ id: string; role: string; content: string }> = [];
  private handlers: StoredHandler[] = [];
  private abortController: AbortController = new AbortController();

  constructor(sessionId: string, config: SessionConfig) {
    this.sessionId = sessionId;
    this._model = config.model ?? 'gpt-4o';
    this._tools = config.tools ?? [];
    this.createdAt = Date.now();
  }

  async send(options: MessageOptions): Promise<string> {
    const messageId = generateUUID();

    this.messages.push({
      id: generateUUID(),
      role: 'user',
      content: options.prompt,
    });

    this.abortController = new AbortController();
    void this.simulateResponse(options.prompt, messageId);
    return messageId;
  }

  async sendAndWait(options: MessageOptions, timeout?: number): Promise<SessionEvent | undefined> {
    return new Promise<SessionEvent | undefined>((resolve, reject) => {
      const timeoutMs = timeout ?? 30000;
      // eslint-disable-next-line prefer-const
      let timer: ReturnType<typeof setTimeout> | undefined;

      const unsubscribe = this.on('session.idle', () => {
        if (timer !== undefined) { clearTimeout(timer); }
        unsubscribe();
        const lastAssistant = [...this.messages].reverse().find((m) => m.role === 'assistant');
        if (lastAssistant) {
          resolve({
            type: 'assistant.message',
            data: { messageId: lastAssistant.id, content: lastAssistant.content },
          });
        } else {
          resolve(undefined);
        }
      });

      timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`sendAndWait timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      void this.send(options).catch((err) => {
        if (timer !== undefined) { clearTimeout(timer); }
        unsubscribe();
        reject(err);
      });
    });
  }

  async abort(): Promise<void> {
    this.abortController.abort();
  }

  async setModel(model: string): Promise<void> {
    this._model = model;
  }

  on(event: string, handler: EventHandler): () => void;
  on(handler: EventHandler): () => void;
  on(eventOrHandler: string | EventHandler, maybeHandler?: EventHandler): () => void {
    let stored: StoredHandler;
    if (typeof eventOrHandler === 'string') {
      stored = { filter: eventOrHandler, handler: maybeHandler! };
    } else {
      stored = { filter: null, handler: eventOrHandler };
    }
    this.handlers.push(stored);
    return () => {
      const index = this.handlers.indexOf(stored);
      if (index !== -1) { this.handlers.splice(index, 1); }
    };
  }

  async getMessages(): Promise<SessionEvent[]> {
    return this.messages.map((m) => ({
      type: m.role === 'user' ? 'user.message' : 'assistant.message',
      data: { messageId: m.id, content: m.content },
    }));
  }

  async disconnect(): Promise<void> {
    this.abortController.abort();
    this.handlers.length = 0;
  }

  private emit(event: SessionEvent): void {
    for (const stored of [...this.handlers]) {
      if (stored.filter === null || stored.filter === event.type) {
        stored.handler(event);
      }
    }
  }

  private async simulateResponse(prompt: string, messageId: string): Promise<void> {
    const signal = this.abortController.signal;

    // Reasoning delta
    this.emit({
      type: 'assistant.reasoning_delta',
      data: { reasoningId: generateUUID(), deltaContent: `Analyzing: "${prompt}"` },
    });
    await this.delay(50, signal);
    if (signal.aborted) { return; }

    // Simulate a plan for multi-step prompts
    const lower = prompt.toLowerCase();
    const isComplex = lower.includes('plan') || lower.includes('help') || lower.includes('create')
      || lower.includes('build') || lower.includes('analyze') || lower.includes('write');

    if (isComplex) {
      // Call manage_todo_list tool (initial list)
      const todoToolCallId = generateUUID();
      const todoArgs = {
        todoList: [
          { id: 1, title: 'Understand the request', status: 'in-progress' as const },
          { id: 2, title: 'Research relevant files', status: 'not-started' as const },
          { id: 3, title: 'Implement changes', status: 'not-started' as const },
        ],
      };

      this.emit({
        type: 'tool.execution_start',
        data: { toolCallId: todoToolCallId, toolName: 'manage_todo_list', arguments: todoArgs },
      });

      // Route to registered handler
      const todoTool = this._tools.find(t => t.name === 'manage_todo_list');
      let todoResult: unknown = { success: true };
      if (todoTool) {
        todoResult = await todoTool.handler(todoArgs);
      }

      this.emit({
        type: 'tool.execution_complete',
        data: { toolCallId: todoToolCallId, success: true, result: todoResult },
      });
      await this.delay(60, signal);
      if (signal.aborted) { return; }
    }

    // Tool calls — read a file (triggers Input section)
    const readToolCallId = generateUUID();
    this.emit({
      type: 'tool.execution_start',
      data: {
        toolCallId: readToolCallId,
        toolName: 'read_file',
        arguments: { path: './src/example.ts' },
      },
    });
    await this.delay(80, signal);
    if (signal.aborted) { return; }

    this.emit({
      type: 'tool.execution_complete',
      data: {
        toolCallId: readToolCallId,
        success: true,
        result: { content: '// Example TypeScript source file\nexport function hello() { return "world"; }' },
      },
    });
    await this.delay(30, signal);
    if (signal.aborted) { return; }

    if (isComplex) {
      // Write tool call (triggers Output section)
      const writeToolCallId = generateUUID();
      this.emit({
        type: 'tool.execution_start',
        data: {
          toolCallId: writeToolCallId,
          toolName: 'write_file',
          arguments: { path: './src/output.ts' },
        },
      });
      await this.delay(80, signal);
      if (signal.aborted) { return; }

      this.emit({
        type: 'tool.execution_complete',
        data: {
          toolCallId: writeToolCallId,
          success: true,
          result: { content: 'File written successfully' },
          fileMeta: { path: './src/output.ts', size: 1248, action: 'created' },
        },
      });
      await this.delay(30, signal);
      if (signal.aborted) { return; }

      // Update todo list — steps 1 & 2 done, step 3 in progress
      const todoUpdateId = generateUUID();
      const updatedArgs = {
        todoList: [
          { id: 1, title: 'Understand the request', status: 'completed' as const },
          { id: 2, title: 'Research relevant files', status: 'completed' as const },
          { id: 3, title: 'Implement changes', status: 'in-progress' as const },
        ],
      };

      this.emit({
        type: 'tool.execution_start',
        data: { toolCallId: todoUpdateId, toolName: 'manage_todo_list', arguments: updatedArgs },
      });

      const todoTool = this._tools.find(t => t.name === 'manage_todo_list');
      let result: unknown = { success: true };
      if (todoTool) {
        result = await todoTool.handler(updatedArgs);
      }

      this.emit({
        type: 'tool.execution_complete',
        data: { toolCallId: todoUpdateId, success: true, result },
      });
      await this.delay(30, signal);
      if (signal.aborted) { return; }
    }

    // Stream response word by word
    const response = this.generateResponse(prompt);
    const words = response.split(' ');
    for (const word of words) {
      if (signal.aborted) { return; }
      this.emit({
        type: 'assistant.message_delta',
        data: { messageId, deltaContent: word + ' ' },
      });
      await this.delay(10 + Math.random() * 20, signal);
    }

    if (signal.aborted) { return; }

    this.messages.push({ id: messageId, role: 'assistant', content: response });

    this.emit({
      type: 'assistant.message',
      data: { messageId, content: response },
    });
    this.emit({ type: 'session.idle', data: {} });
  }

  private generateResponse(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('email') || lower.includes('draft')) {
      return 'I can help you draft that email. Here is a suggested draft.';
    }
    if (lower.includes('spreadsheet') || lower.includes('data') || lower.includes('analyze')) {
      return 'I have analyzed the data. Revenue increased 12% month-over-month.';
    }
    if (lower.includes('meeting') || lower.includes('calendar')) {
      return 'I have reviewed your calendar. You have 3 meetings today.';
    }
    return `I understand you want help with: "${input}". This is a mock response for testing.`;
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) { resolve(); return; }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}

export class MockCopilotSDK implements ICopilotSDK {
  private started = false;
  private sessions = new Map<string, MockSDKSession>();

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<Error[]> {
    for (const session of this.sessions.values()) {
      await session.disconnect();
    }
    this.sessions.clear();
    this.started = false;
    return [];
  }

  async createSession(config: SessionConfig): Promise<ISDKSession> {
    this.ensureStarted();
    const sessionId = config.sessionId ?? generateUUID();
    const session = new MockSDKSession(sessionId, config);
    this.sessions.set(sessionId, session);
    return session;
  }

  async resumeSession(sessionId: string, _config?: Partial<SessionConfig>): Promise<ISDKSession> {
    this.ensureStarted();
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  async listSessions(): Promise<SessionMetadata[]> {
    this.ensureStarted();
    return Array.from(this.sessions.values()).map((s) => ({
      sessionId: s.sessionId,
      startTime: new Date(s.createdAt),
      modifiedTime: new Date(s.createdAt),
    }));
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.ensureStarted();
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.disconnect();
      this.sessions.delete(sessionId);
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        capabilities: {
          supports: { vision: true, reasoningEffort: false },
          limits: { max_context_window_tokens: 128000 },
        },
        policy: { state: 'enabled' },
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        capabilities: {
          supports: { vision: true, reasoningEffort: false },
          limits: { max_context_window_tokens: 128000 },
        },
        policy: { state: 'enabled' },
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        capabilities: {
          supports: { vision: true, reasoningEffort: false },
          limits: { max_context_window_tokens: 200000 },
        },
        policy: { state: 'enabled' },
      },
    ];
  }

  async restart(_options?: { githubToken?: string; useMock?: boolean }): Promise<void> {
    await this.stop();
    await this.start();
  }

  async ping(message?: string): Promise<PingResponse> {
    return { message: message ?? 'pong', timestamp: Date.now() };
  }

  async getQuota(): Promise<SDKQuotaResult> {
    return { quotaSnapshots: {} };
  }

  private ensureStarted(): void {
    if (!this.started) {
      throw new Error('SDK not started. Call start() first.');
    }
  }
}
