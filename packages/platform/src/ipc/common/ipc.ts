/**
 * IPC channel definitions with zod schemas for runtime validation.
 */
import { z } from 'zod';

export const IPC_CHANNELS = {
  AGENT_SEND_MESSAGE: 'agent:send-message',
  AGENT_CANCEL: 'agent:cancel',
  AGENT_EVENT: 'agent:event',
  CONVERSATION_LIST: 'conversation:list',
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_GET: 'conversation:get',
  CONVERSATION_DELETE: 'conversation:delete',
  CONVERSATION_RENAME: 'conversation:rename',
  MODEL_LIST: 'model:list',
  MODEL_SELECT: 'model:select',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_STATE: 'auth:state',
  AUTH_STATE_CHANGED: 'auth:state-changed',
  STORAGE_GET: 'storage:get',
  STORAGE_SET: 'storage:set',
  PORT_AGENT_HOST: 'port:agent-host',
  ONBOARDING_CHECK_GH: 'onboarding:check-gh',
  ONBOARDING_GH_LOGIN: 'onboarding:gh-login',
  ONBOARDING_GH_LOGIN_EVENT: 'onboarding:gh-login-event',
  ONBOARDING_CHECK_COPILOT: 'onboarding:check-copilot',
  ONBOARDING_COMPLETE: 'onboarding:complete',
  ONBOARDING_STATUS: 'onboarding:status',
  // Connector channels
  CONNECTOR_LIST: 'connector:list',
  CONNECTOR_REMOVE: 'connector:remove',
  CONNECTOR_CONNECT: 'connector:connect',
  CONNECTOR_DISCONNECT: 'connector:disconnect',
  CONNECTOR_STATUS_CHANGED: 'connector:status-changed',
  CONNECTOR_LIST_CHANGED: 'connector:list-changed',
  CONNECTOR_SETUP_CONVERSATION: 'connector:setup-conversation',
  // Skill channels
  SKILL_LIST: 'skill:list',
  SKILL_SOURCES: 'skill:sources',
  SKILL_ADD_PATH: 'skill:add-path',
  SKILL_REMOVE_PATH: 'skill:remove-path',
  SKILL_RESCAN: 'skill:rescan',
  SKILL_CHANGED: 'skill:changed',
  SKILL_TOGGLE: 'skill:toggle',
  SKILL_DISABLED_LIST: 'skill:disabled-list',
  SKILL_OPEN_FILE: 'skill:open-file',
  // Dialog channels
  DIALOG_OPEN_FOLDER: 'dialog:open-folder',
} as const;

export const SendMessageRequestSchema = z.object({
  conversationId: z.string(),
  content: z.string(),
  model: z.string().optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const SendMessageResponseSchema = z.object({
  messageId: z.string(),
});
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

export const ConversationListResponseSchema = z.object({
  conversations: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      updatedAt: z.number(),
    }),
  ),
});
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

const ToolCallPartialSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  toolName: z.string(),
  serverName: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  permission: z.enum(['allow_once', 'allow_always', 'deny', 'deny_always', 'pending']),
  status: z.enum(['pending', 'approved', 'denied', 'executing', 'completed', 'failed']),
  timestamp: z.number(),
});

const ToolResultSchema = z.object({
  success: z.boolean(),
  content: z.unknown(),
  error: z.string().optional(),
});

// NOTE: AgentEvent is defined in both types.ts and ipc.ts — keep in sync.
export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({ type: z.literal('text_delta'), content: z.string() }),
  z.object({ type: z.literal('thinking'), content: z.string() }),
  z.object({ type: z.literal('thinking_delta'), content: z.string() }),
  z.object({ type: z.literal('tool_call_start'), toolCall: ToolCallPartialSchema }),
  z.object({ type: z.literal('tool_call_result'), toolCallId: z.string(), result: ToolResultSchema }),
  z.object({ type: z.literal('error'), error: z.string() }),
  z.object({ type: z.literal('done'), messageId: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

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

// --- Onboarding schemas ---
export const GhCheckResponseSchema = z.object({
  installed: z.boolean(),
  version: z.string().optional(),
  authenticated: z.boolean(),
  login: z.string().optional(),
  hasCopilotScope: z.boolean(),
});
export type GhCheckResponse = z.infer<typeof GhCheckResponseSchema>;

export const GhLoginResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type GhLoginResponse = z.infer<typeof GhLoginResponseSchema>;

export const GhLoginEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('device_code'), code: z.string(), url: z.string() }),
  z.object({ type: z.literal('browser_opened') }),
  z.object({ type: z.literal('authenticated') }),
]);
export type GhLoginEvent = z.infer<typeof GhLoginEventSchema>;

export const CopilotCheckResponseSchema = z.object({
  hasSubscription: z.boolean(),
  tier: z.enum(['free', 'pro', 'pro_plus', 'business', 'enterprise']).optional(),
  user: z.object({
    githubId: z.string(),
    githubLogin: z.string(),
    avatarUrl: z.string(),
    name: z.string().optional(),
  }).optional(),
  models: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).optional(),
  error: z.string().optional(),
});
export type CopilotCheckResponse = z.infer<typeof CopilotCheckResponseSchema>;

export const OnboardingStatusResponseSchema = z.object({
  complete: z.boolean(),
});
export type OnboardingStatusResponse = z.infer<typeof OnboardingStatusResponseSchema>;

export const AuthStateSchema = z.object({
  isAuthenticated: z.boolean(),
  user: z.object({
    githubId: z.string(),
    githubLogin: z.string(),
    avatarUrl: z.string(),
    copilotTier: z.enum(['free', 'pro', 'pro_plus', 'business', 'enterprise']),
  }).nullable(),
});
export type AuthState = z.infer<typeof AuthStateSchema>;

// --- Connector schemas ---

/** Mirrors MCPServerConfig from @gho-work/base for IPC transport. */
const MCPServerConfigSchema = z.object({
  type: z.enum(['stdio', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

/** Mirrors MCPServerState from @gho-work/base for IPC transport. */
export const MCPServerStateSchema = z.object({
  name: z.string(),
  config: MCPServerConfigSchema,
  status: z.enum(['connected', 'disconnected', 'error', 'initializing']),
  error: z.string().optional(),
});
export type MCPServerStateIPC = z.infer<typeof MCPServerStateSchema>;

export const ConnectorListResponseSchema = z.object({
  servers: z.array(MCPServerStateSchema),
});
export type ConnectorListResponse = z.infer<typeof ConnectorListResponseSchema>;

export const ConnectorRemoveRequestSchema = z.object({ name: z.string() });
export type ConnectorRemoveRequest = z.infer<typeof ConnectorRemoveRequestSchema>;

export const ConnectorConnectRequestSchema = z.object({ name: z.string() });
export type ConnectorConnectRequest = z.infer<typeof ConnectorConnectRequestSchema>;

export const ConnectorDisconnectRequestSchema = z.object({ name: z.string() });
export type ConnectorDisconnectRequest = z.infer<typeof ConnectorDisconnectRequestSchema>;

export const ConnectorStatusChangedSchema = z.object({
  name: z.string(),
  status: z.enum(['connected', 'disconnected', 'error', 'initializing']),
  error: z.string().optional(),
});
export type ConnectorStatusChanged = z.infer<typeof ConnectorStatusChangedSchema>;

export const ConnectorSetupRequestSchema = z.object({
  query: z.string().optional(),
});
export type ConnectorSetupRequest = z.infer<typeof ConnectorSetupRequestSchema>;

export const ConnectorSetupResponseSchema = z.object({
  conversationId: z.string(),
  error: z.string().optional(),
});
export type ConnectorSetupResponse = z.infer<typeof ConnectorSetupResponseSchema>;

// --- Skill schemas ---

export const SkillEntryDTOSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  description: z.string(),
  sourceId: z.string(),
  filePath: z.string(),
  disabled: z.boolean().optional(),
});
export type SkillEntryDTO = z.infer<typeof SkillEntryDTOSchema>;

export const SkillSourceDTOSchema = z.object({
  id: z.string(),
  priority: z.number(),
  basePath: z.string(),
});
export type SkillSourceDTO = z.infer<typeof SkillSourceDTOSchema>;

export const SkillAddPathRequestSchema = z.object({ path: z.string() });
export type SkillAddPathRequest = z.infer<typeof SkillAddPathRequestSchema>;

export const SkillAddPathResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ error: z.string() }),
]);
export type SkillAddPathResponse = z.infer<typeof SkillAddPathResponseSchema>;

export const SkillRemovePathRequestSchema = z.object({ path: z.string() });
export type SkillRemovePathRequest = z.infer<typeof SkillRemovePathRequestSchema>;

export const SkillToggleRequestSchema = z.object({
  skillId: z.string(),
  enabled: z.boolean(),
});
export type SkillToggleRequest = z.infer<typeof SkillToggleRequestSchema>;
