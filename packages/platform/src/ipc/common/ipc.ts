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
  ONBOARDING_DETECT_TOOLS: 'onboarding:detect-tools',
  ONBOARDING_COMPLETE: 'onboarding:complete',
  ONBOARDING_STATUS: 'onboarding:status',
  // Connector channels
  CONNECTOR_LIST: 'connector:list',
  CONNECTOR_ADD: 'connector:add',
  CONNECTOR_REMOVE: 'connector:remove',
  CONNECTOR_UPDATE: 'connector:update',
  CONNECTOR_TEST: 'connector:test',
  CONNECTOR_GET_TOOLS: 'connector:get-tools',
  CONNECTOR_STATUS_CHANGED: 'connector:status-changed',
  CONNECTOR_TOOLS_CHANGED: 'connector:tools-changed',
  CLI_DETECT_ALL: 'cli:detect-all',
  CLI_REFRESH: 'cli:refresh',
  CLI_CREATE_INSTALL_CONVERSATION: 'cli:create-install-conversation',
  CLI_GET_PLATFORM_CONTEXT: 'cli:get-platform-context',
  CLI_INSTALL: 'cli:install',
  CLI_AUTHENTICATE: 'cli:authenticate',
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

export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({ type: z.literal('text_delta'), content: z.string() }),
  z.object({ type: z.literal('thinking'), content: z.string() }),
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
});
export type CopilotCheckResponse = z.infer<typeof CopilotCheckResponseSchema>;

export const ToolDetectResponseSchema = z.object({
  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    found: z.boolean(),
    version: z.string().optional(),
  })),
});
export type ToolDetectResponse = z.infer<typeof ToolDetectResponseSchema>;

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
export const ConnectorConfigSchema = z.object({
  id: z.string(),
  type: z.enum(['builtin', 'local_mcp', 'remote_mcp', 'agent_skill']),
  name: z.string(),
  transport: z.enum(['stdio', 'streamable_http']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean(),
  capabilities: z.object({
    tools: z.boolean().optional(),
    resources: z.boolean().optional(),
    prompts: z.boolean().optional(),
  }).optional(),
  status: z.enum(['connected', 'disconnected', 'error', 'initializing']),
  error: z.string().optional(),
  toolsConfig: z.record(z.string(), z.boolean()).optional(),
});
export type ConnectorConfigIPC = z.infer<typeof ConnectorConfigSchema>;

export const ConnectorListResponseSchema = z.object({
  connectors: z.array(ConnectorConfigSchema),
});
export type ConnectorListResponse = z.infer<typeof ConnectorListResponseSchema>;

export const ConnectorRemoveRequestSchema = z.object({ id: z.string() });
export type ConnectorRemoveRequest = z.infer<typeof ConnectorRemoveRequestSchema>;

export const ConnectorUpdateRequestSchema = z.object({
  id: z.string(),
  updates: ConnectorConfigSchema.partial(),
});
export type ConnectorUpdateRequest = z.infer<typeof ConnectorUpdateRequestSchema>;

export const ConnectorTestResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type ConnectorTestResponse = z.infer<typeof ConnectorTestResponseSchema>;

export const ConnectorGetToolsRequestSchema = z.object({ id: z.string() });
export type ConnectorGetToolsRequest = z.infer<typeof ConnectorGetToolsRequestSchema>;

export const ToolInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean(),
});

export const ConnectorGetToolsResponseSchema = z.object({
  tools: z.array(ToolInfoSchema),
});
export type ConnectorGetToolsResponse = z.infer<typeof ConnectorGetToolsResponseSchema>;

export const ConnectorStatusChangedSchema = z.object({
  id: z.string(),
  status: z.enum(['connected', 'disconnected', 'error', 'initializing']),
  error: z.string().optional(),
});
export type ConnectorStatusChanged = z.infer<typeof ConnectorStatusChangedSchema>;

export const ConnectorToolsChangedSchema = z.object({
  connectorId: z.string(),
  tools: z.array(ToolInfoSchema),
});
export type ConnectorToolsChanged = z.infer<typeof ConnectorToolsChangedSchema>;

export const CLIToolStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  installed: z.boolean(),
  version: z.string().optional(),
  authenticated: z.boolean().optional(),
  installUrl: z.string(),
  authCommand: z.string().optional(),
});

export const CLIDetectResponseSchema = z.object({
  tools: z.array(CLIToolStatusSchema),
});
export type CLIDetectResponse = z.infer<typeof CLIDetectResponseSchema>;

export const CLICreateInstallRequestSchema = z.object({
  toolId: z.string(),
});
export type CLICreateInstallRequest = z.infer<typeof CLICreateInstallRequestSchema>;

export const CLICreateInstallResponseSchema = z.object({
  conversationId: z.string(),
});
export type CLICreateInstallResponse = z.infer<typeof CLICreateInstallResponseSchema>;

export const PlatformContextSchema = z.object({
  os: z.enum(['darwin', 'win32', 'linux']),
  arch: z.enum(['arm64', 'x64', 'ia32']),
  packageManagers: z.object({
    brew: z.boolean(),
    winget: z.boolean(),
    chocolatey: z.boolean(),
  }),
});
export type PlatformContextIPC = z.infer<typeof PlatformContextSchema>;

export const CLIInstallRequestSchema = z.object({
  toolId: z.string(),
});
export type CLIInstallRequest = z.infer<typeof CLIInstallRequestSchema>;

export const CLIInstallResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  version: z.string().optional(),
  installUrl: z.string().optional(),
});
export type CLIInstallResponse = z.infer<typeof CLIInstallResponseSchema>;

export const CLIAuthenticateRequestSchema = z.object({
  toolId: z.string(),
});
export type CLIAuthenticateRequest = z.infer<typeof CLIAuthenticateRequestSchema>;

export const CLIAuthenticateResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type CLIAuthenticateResponse = z.infer<typeof CLIAuthenticateResponseSchema>;
