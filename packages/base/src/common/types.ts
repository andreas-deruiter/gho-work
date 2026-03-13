/**
 * Core data models for GHO Work (from PRD Section 7).
 */

// --- User & Workspace ---

export interface User {
  githubId: string;
  githubLogin: string;
  copilotTier: 'free' | 'pro' | 'pro_plus' | 'business' | 'enterprise';
  avatarUrl: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  defaultModel: string;
  theme: 'light' | 'dark' | 'system';
  maxIterations: number;
  autoApproveReadTools: boolean;
  notificationsEnabled: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  memoryFilePaths: string[];
  createdAt: number;
  lastOpenedAt: number;
}

// --- Conversation ---

export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  model: string;
  status: 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool_result';
  content: string | StructuredContent;
  toolCalls: ToolCall[];
  timestamp: number;
}

export interface StructuredContent {
  type: 'text' | 'markdown' | 'code' | 'table' | 'image';
  data: string;
  metadata?: Record<string, unknown>;
}

// --- Tool Calls ---

export interface ToolCall {
  id: string;
  messageId: string;
  toolName: string;
  serverName: string;
  arguments: Record<string, unknown>;
  result: ToolResult | null;
  permission: PermissionDecision;
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'failed';
  durationMs: number | null;
  timestamp: number;
}

export interface ToolResult {
  success: boolean;
  content: string | unknown;
  error?: string;
}

export type PermissionDecision = 'allow_once' | 'allow_always' | 'deny' | 'deny_always' | 'pending';

/** Full tool call lifecycle states (agent-side). UI uses a subset via ToolCallDisplayState. */
export enum ToolCallState {
  Streaming = 'streaming',
  WaitingForConfirmation = 'waiting_for_confirmation',
  Executing = 'executing',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

// --- Connectors ---

/** Persisted in mcp.json — one entry per server. VS Code-compatible. */
export interface MCPServerConfig {
  type: 'stdio' | 'http';
  command?: string;                    // stdio
  args?: string[];                     // stdio
  env?: Record<string, string>;        // stdio
  cwd?: string;                        // stdio
  url?: string;                        // http
  headers?: Record<string, string>;    // http
}

/** Runtime state — held in memory only. */
export interface MCPServerState {
  name: string;
  config: MCPServerConfig;
  status: 'connected' | 'disconnected' | 'error' | 'initializing';
  error?: string;
}

export type MCPServerStatus = MCPServerState['status'];

// --- Permissions ---

export interface PermissionRule {
  id: string;
  scope: 'global' | 'workspace';
  workspaceId?: string;
  toolPattern: string;
  serverName?: string;
  decision: 'allow' | 'deny';
  createdAt: number;
}

// --- Agent Events (event-driven architecture) ---

// NOTE: AgentEvent is defined in both types.ts and ipc.ts — keep in sync.
export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'tool_call_start'; toolCall: Omit<ToolCall, 'result' | 'durationMs'> }
  | { type: 'tool_call_result'; toolCallId: string; result: ToolResult }
  | { type: 'error'; error: string }
  | { type: 'done'; messageId: string };

// --- Agent Context ---

export interface AgentContext {
  conversationId: string;
  workspaceId: string;
  model?: string;
  systemPrompt?: string;
  memoryContext?: string;
  maxIterations?: number;
}
