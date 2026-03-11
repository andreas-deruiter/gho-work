/**
 * Mock implementation of ICopilotSDK and ISDKSession for testing and development.
 * Simulates the Copilot SDK agent loop with streaming events and fake tool calls.
 */
import { generateUUID } from '@gho-work/base';
import type { ICopilotSDK, ISDKSession } from '../common/copilotSDK.js';
import type { SessionConfig, SendOptions, SessionEvent, SDKMessage, SessionMetadata } from '../common/types.js';

type EventHandler = (event: SessionEvent) => void;

interface StoredHandler {
  filter: string | null;
  handler: EventHandler;
}

class MockSDKSession implements ISDKSession {
  readonly sessionId: string;
  readonly model: string;
  readonly createdAt: number;

  private messages: SDKMessage[] = [];
  private handlers: StoredHandler[] = [];
  private abortController: AbortController = new AbortController();

  constructor(sessionId: string, model: string) {
    this.sessionId = sessionId;
    this.model = model;
    this.createdAt = Date.now();
  }

  async send(options: SendOptions): Promise<string> {
    const messageId = generateUUID();

    // Store user message
    this.messages.push({
      id: generateUUID(),
      role: 'user',
      content: options.prompt,
    });

    // Reset abort controller for new send
    this.abortController = new AbortController();

    // Start async simulation (non-blocking)
    void this.simulateResponse(options.prompt, messageId);

    return messageId;
  }

  async sendAndWait(options: SendOptions, timeout?: number): Promise<SDKMessage> {
    return new Promise<SDKMessage>((resolve, reject) => {
      const timeoutMs = timeout ?? 30000;
      // eslint-disable-next-line prefer-const
      let timer: ReturnType<typeof setTimeout> | undefined;

      const unsubscribe = this.on('session.idle', () => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        unsubscribe();
        // Return the last assistant message
        const lastAssistant = [...this.messages].reverse().find((m) => m.role === 'assistant');
        if (lastAssistant) {
          resolve(lastAssistant);
        } else {
          reject(new Error('No assistant message received'));
        }
      });

      timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`sendAndWait timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      void this.send(options).catch((err) => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        unsubscribe();
        reject(err);
      });
    });
  }

  async abort(): Promise<void> {
    this.abortController.abort();
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
      if (index !== -1) {
        this.handlers.splice(index, 1);
      }
    };
  }

  async getMessages(): Promise<SDKMessage[]> {
    return [...this.messages];
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
    this.emit({ type: 'assistant.reasoning_delta', content: `Analyzing: "${prompt}"` });
    await this.delay(50, signal);
    if (signal.aborted) { return; }

    // Tool calls for file/search prompts
    const lower = prompt.toLowerCase();
    if (lower.includes('file') || lower.includes('search')) {
      const toolCallId = generateUUID();
      this.emit({
        type: 'tool.execution_start',
        toolCallId,
        toolName: 'FileRead',
        arguments: { path: './example.md' },
      });
      await this.delay(80, signal);
      if (signal.aborted) { return; }

      this.emit({
        type: 'tool.execution_complete',
        toolCallId,
        toolName: 'FileRead',
        result: { success: true, content: '# Example Document\n\nThis is mock file content.' },
      });
      await this.delay(30, signal);
      if (signal.aborted) { return; }
    }

    // Stream response word by word
    const response = this.generateResponse(prompt);
    const words = response.split(' ');
    for (const word of words) {
      if (signal.aborted) { return; }
      this.emit({ type: 'assistant.message_delta', content: word + ' ' });
      await this.delay(10 + Math.random() * 20, signal);
    }

    if (signal.aborted) { return; }

    // Store assistant message
    this.messages.push({
      id: messageId,
      role: 'assistant',
      content: response,
    });

    // Final events
    this.emit({ type: 'assistant.message', messageId, content: response });
    this.emit({ type: 'session.idle' });
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
      if (signal.aborted) {
        resolve();
        return;
      }
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

  async stop(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.disconnect();
    }
    this.sessions.clear();
    this.started = false;
  }

  async createSession(config: SessionConfig): Promise<ISDKSession> {
    this.ensureStarted();
    const sessionId = config.sessionId ?? generateUUID();
    const session = new MockSDKSession(sessionId, config.model);
    this.sessions.set(sessionId, session);
    return session;
  }

  async resumeSession(sessionId: string): Promise<ISDKSession> {
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
      model: s.model,
      createdAt: s.createdAt,
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

  async ping(): Promise<string> {
    return 'pong';
  }

  private ensureStarted(): void {
    if (!this.started) {
      throw new Error('SDK not started. Call start() first.');
    }
  }
}
