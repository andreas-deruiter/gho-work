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
  connectorOverrides: Record<string, Partial<ConnectorConfig>>;
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

// --- Connectors ---

export interface ConnectorConfig {
  id: string;
  type: 'builtin' | 'local_mcp' | 'remote_mcp' | 'agent_skill';
  name: string;
  transport: 'stdio' | 'streamable_http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  capabilities?: ServerCapabilities;
  status: 'connected' | 'disconnected' | 'error' | 'initializing';
  error?: string;
  toolsConfig?: Record<string, boolean>;
}

export interface ServerCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
}

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

export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'thinking'; content: string }
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
