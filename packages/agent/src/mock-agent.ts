/**
 * Mock agent implementation for the spike.
 * Simulates the Copilot SDK agent loop with streaming responses
 * and fake tool calls.
 */
import { generateUUID, Emitter } from '@gho-work/base';
import type { AgentContext, AgentEvent } from '@gho-work/base';
import type { ICopilotSDK, IAgentService } from './interfaces.js';

// --- Mock Copilot SDK ---

export class MockCopilotSDK implements ICopilotSDK {
  private activeSessions = new Map<string, AbortController>();

  async createSession(_context: AgentContext): Promise<string> {
    const sessionId = generateUUID();
    this.activeSessions.set(sessionId, new AbortController());
    return sessionId;
  }

  async *sendMessage(sessionId: string, content: string): AsyncIterable<AgentEvent> {
    const controller = this.activeSessions.get(sessionId);
    if (!controller) throw new Error(`No session: ${sessionId}`);

    // Simulate thinking
    yield { type: 'thinking', content: `Analyzing request: "${content}"` };
    await this.delay(300, controller.signal);

    // Simulate a tool call if the message mentions certain keywords
    if (content.toLowerCase().includes('file') || content.toLowerCase().includes('search')) {
      const toolCallId = generateUUID();
      yield {
        type: 'tool_call_start',
        toolCall: {
          id: toolCallId,
          messageId: '',
          toolName: 'FileRead',
          serverName: 'built-in',
          arguments: { path: './example.md' },
          permission: 'allow_once',
          status: 'executing',
          timestamp: Date.now(),
        },
      };
      await this.delay(500, controller.signal);
      yield {
        type: 'tool_call_result',
        toolCallId,
        result: { success: true, content: '# Example Document\n\nThis is mock file content.' },
      };
      await this.delay(200, controller.signal);
    }

    // Simulate streaming text response
    const response = this.generateResponse(content);
    const words = response.split(' ');
    for (const word of words) {
      if (controller.signal.aborted) return;
      yield { type: 'text_delta', content: word + ' ' };
      await this.delay(30 + Math.random() * 50, controller.signal);
    }

    const messageId = generateUUID();
    yield { type: 'done', messageId };
  }

  cancelSession(sessionId: string): void {
    const controller = this.activeSessions.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeSessions.delete(sessionId);
    }
  }

  dispose(): void {
    for (const [, controller] of this.activeSessions) {
      controller.abort();
    }
    this.activeSessions.clear();
  }

  private generateResponse(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('email') || lower.includes('draft')) {
      return 'I can help you draft that email. Here is a suggested draft:\n\n**Subject:** Follow-up on our discussion\n\nHi team,\n\nI wanted to follow up on the points we discussed. Let me know if you have any questions.\n\nBest regards';
    }
    if (lower.includes('spreadsheet') || lower.includes('data') || lower.includes('analyze')) {
      return 'I have analyzed the data. Here are the key findings:\n\n1. **Revenue** increased 12% month-over-month\n2. **Active users** grew to 15,234\n3. **Churn rate** decreased to 2.1%\n\nWould you like me to generate a detailed report?';
    }
    if (lower.includes('meeting') || lower.includes('calendar')) {
      return 'I have reviewed your calendar. You have 3 meetings today:\n\n- **10:00 AM** — Team standup (15 min)\n- **2:00 PM** — Product review (1 hr)\n- **4:30 PM** — 1:1 with Sarah (30 min)\n\nShall I prepare notes for any of these?';
    }
    return `I understand you want help with: "${input}"\n\nI am a mock agent in the GHO Work spike. In the full implementation, I would use the GitHub Copilot SDK to process this request with real LLM capabilities, MCP connectors, and tool execution.\n\nFor now, I can simulate basic interactions to validate the architecture.`;
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { resolve(); return; }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}

// --- Mock Agent Service ---

export class MockAgentService implements IAgentService {
  private sdk: ICopilotSDK;
  private activeTaskSession: string | null = null;

  constructor(sdk: ICopilotSDK) {
    this.sdk = sdk;
  }

  async *executeTask(prompt: string, context: AgentContext): AsyncIterable<AgentEvent> {
    const sessionId = await this.sdk.createSession(context);
    this.activeTaskSession = sessionId;
    try {
      yield* this.sdk.sendMessage(sessionId, prompt);
    } finally {
      this.activeTaskSession = null;
    }
  }

  cancelTask(_taskId: string): void {
    if (this.activeTaskSession) {
      this.sdk.cancelSession(this.activeTaskSession);
      this.activeTaskSession = null;
    }
  }
}
