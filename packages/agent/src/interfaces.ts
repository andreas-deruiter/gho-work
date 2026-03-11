/**
 * Core agent service interfaces (from PRD Section 6.4).
 */
import { createServiceId } from '@gho-work/base';
import type { AgentContext, AgentEvent, ToolCall, PermissionDecision, ConnectorConfig } from '@gho-work/base';

// --- ICopilotSDK ---

/**
 * Abstraction over the GH Copilot SDK agent harness.
 * Creates sessions, configures models, manages SDK lifecycle.
 * In the spike, this is mocked.
 */
export interface ICopilotSDK {
  createSession(context: AgentContext): Promise<string>; // returns sessionId
  sendMessage(sessionId: string, content: string): AsyncIterable<AgentEvent>;
  cancelSession(sessionId: string): void;
  dispose(): void;
}

export const ICopilotSDK = createServiceId<ICopilotSDK>('ICopilotSDK');

// --- IAgentService ---

/**
 * Orchestrates task execution sessions.
 * Injects context, registers MCP tools, enforces permissions, streams events.
 */
export interface IAgentService {
  executeTask(prompt: string, context: AgentContext): AsyncIterable<AgentEvent>;
  cancelTask(taskId: string): void;
}

export const IAgentService = createServiceId<IAgentService>('IAgentService');

// --- IPermissionService ---

/**
 * Enforces the trust model. Intercepts tool calls for approval.
 */
export interface IPermissionService {
  checkPermission(toolCall: Omit<ToolCall, 'result' | 'durationMs'>): Promise<PermissionDecision>;
  setRule(toolPattern: string, decision: 'allow' | 'deny', scope: 'global' | 'workspace'): void;
}

export const IPermissionService = createServiceId<IPermissionService>('IPermissionService');

// --- IMCPManager ---

/**
 * MCP client lifecycle management.
 * Creates/manages MCP client connections, handles capability negotiation.
 */
export interface IMCPManager {
  connect(config: ConnectorConfig): Promise<void>;
  disconnect(connectorId: string): Promise<void>;
  listTools(connectorId: string): Promise<Array<{ name: string; description: string }>>;
  callTool(connectorId: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export const IMCPManager = createServiceId<IMCPManager>('IMCPManager');
