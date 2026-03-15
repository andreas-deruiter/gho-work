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
  // Marketplace channels
  MARKETPLACE_LIST: 'marketplace:list',
  MARKETPLACE_ADD: 'marketplace:add',
  MARKETPLACE_REMOVE: 'marketplace:remove',
  MARKETPLACE_UPDATE: 'marketplace:update',
  // Plugin channels
  PLUGIN_AGENT_LIST: 'plugin:agent-list',
  PLUGIN_CATALOG: 'plugin:catalog',
  PLUGIN_INSTALL: 'plugin:install',
  PLUGIN_UNINSTALL: 'plugin:uninstall',
  PLUGIN_ENABLE: 'plugin:enable',
  PLUGIN_DISABLE: 'plugin:disable',
  PLUGIN_LIST: 'plugin:list',
  PLUGIN_UPDATE: 'plugin:update',
  PLUGIN_CHANGED: 'plugin:changed',
  PLUGIN_INSTALL_PROGRESS: 'plugin:install-progress',
  PLUGIN_VALIDATE: 'plugin:validate',
  PLUGIN_UPDATES_AVAILABLE: 'plugin:updates-available',
  PLUGIN_SKILL_DETAILS: 'plugin:skill-details',
  // Additional connector channels
  CONNECTOR_ADD: 'connector:add',
  CONNECTOR_UPDATE: 'connector:update',
  // Dialog channels
  DIALOG_OPEN_FOLDER: 'dialog:open-folder',
  DIALOG_OPEN_FILE: 'dialog:open-file',
  // Instructions channels
  INSTRUCTIONS_GET_PATH: 'instructions:get-path',
  INSTRUCTIONS_SET_PATH: 'instructions:set-path',
  // File channels
  FILES_READ_DIR: 'files:read-dir',
  FILES_STAT: 'files:stat',
  FILES_CREATE: 'files:create',
  FILES_RENAME: 'files:rename',
  FILES_DELETE: 'files:delete',
  FILES_WATCH: 'files:watch',
  FILES_UNWATCH: 'files:unwatch',
  FILES_CHANGED: 'files:changed',
  WORKSPACE_GET_ROOT: 'workspace:get-root',
  FILES_SEARCH: 'files:search',
  // Agent state
  AGENT_STATE_CHANGED: 'agent:state-changed',
  // Quota
  QUOTA_GET: 'quota:get',
  QUOTA_CHANGED: 'quota:changed',
  SHELL_SHOW_ITEM_IN_FOLDER: 'shell:showItemInFolder',
} as const;

export const SendMessageRequestSchema = z.object({
  conversationId: z.string(),
  content: z.string(),
  model: z.string().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    path: z.string(),
    size: z.number(),
  })).optional(),
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

const FileMetaSchema = z.object({
  path: z.string(),
  size: z.number(),
  action: z.enum(['created', 'modified']),
});

// NOTE: AgentEvent is defined in both types.ts and ipc.ts — keep in sync.
export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string() }),
  z.object({ type: z.literal('text_delta'), content: z.string() }),
  z.object({ type: z.literal('thinking'), content: z.string() }),
  z.object({ type: z.literal('thinking_delta'), content: z.string() }),
  z.object({ type: z.literal('tool_call_start'), toolCall: ToolCallPartialSchema }),
  z.object({ type: z.literal('tool_call_result'), toolCallId: z.string(), result: ToolResultSchema, fileMeta: FileMetaSchema.optional() }),
  z.object({ type: z.literal('error'), error: z.string() }),
  z.object({ type: z.literal('done'), messageId: z.string() }),
  z.object({
    type: z.literal('todo_list_updated'),
    todos: z.array(z.object({
      id: z.number(),
      title: z.string(),
      status: z.enum(['not-started', 'in-progress', 'completed']),
    })),
  }),
  z.object({
    type: z.literal('attachment_added'),
    messageId: z.string(),
    attachment: z.object({
      name: z.string(),
      path: z.string(),
      source: z.string(),
    }),
  }),
  z.object({
    type: z.literal('subagent_started'),
    parentToolCallId: z.string(),
    name: z.string(),
    displayName: z.string(),
  }),
  z.object({
    type: z.literal('subagent_completed'),
    parentToolCallId: z.string(),
    name: z.string(),
    displayName: z.string(),
  }),
  z.object({
    type: z.literal('subagent_failed'),
    parentToolCallId: z.string(),
    name: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal('context_loaded'),
    sources: z.array(z.object({
      path: z.string(),
      origin: z.enum(['user', 'project']),
      format: z.string(),
    })),
    agents: z.array(z.object({
      name: z.string(),
      plugin: z.string(),
    })),
  }),
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
  source: z.string().optional(),
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

export const ConnectorAddRequestSchema = z.object({
  name: z.string(),
  config: MCPServerConfigSchema,
});
export type ConnectorAddRequest = z.infer<typeof ConnectorAddRequestSchema>;

export const ConnectorUpdateRequestSchema = z.object({
  name: z.string(),
  config: MCPServerConfigSchema,
});
export type ConnectorUpdateRequest = z.infer<typeof ConnectorUpdateRequestSchema>;

// --- Plugin schemas ---

export const PluginNameRequestSchema = z.object({ name: z.string() });
export type PluginNameRequest = z.infer<typeof PluginNameRequestSchema>;

export const PluginCatalogRequestSchema = z.object({ forceRefresh: z.boolean().optional() });
export type PluginCatalogRequest = z.infer<typeof PluginCatalogRequestSchema>;

export const PluginInstallProgressSchema = z.object({
  name: z.string(),
  status: z.enum(['downloading', 'extracting', 'registering', 'done', 'error']),
  message: z.string(),
});
export type PluginInstallProgress = z.infer<typeof PluginInstallProgressSchema>;

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

// --- File schemas ---

export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory', 'symlink']),
  size: z.number(),
  mtime: z.number(),
  isHidden: z.boolean(),
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

export const FileChangeEventSchema = z.object({
  type: z.enum(['created', 'changed', 'deleted']),
  path: z.string(),
});
export type FileChangeEvent = z.infer<typeof FileChangeEventSchema>;

export const FilesReadDirRequestSchema = z.object({ path: z.string() });
export type FilesReadDirRequest = z.infer<typeof FilesReadDirRequestSchema>;

export const FilesStatRequestSchema = z.object({ path: z.string() });
export type FilesStatRequest = z.infer<typeof FilesStatRequestSchema>;

export const FilesCreateRequestSchema = z.object({
  path: z.string(),
  type: z.enum(['file', 'directory']),
  content: z.string().optional(),
});
export type FilesCreateRequest = z.infer<typeof FilesCreateRequestSchema>;

export const FilesRenameRequestSchema = z.object({
  oldPath: z.string(),
  newPath: z.string(),
});
export type FilesRenameRequest = z.infer<typeof FilesRenameRequestSchema>;

export const FilesDeleteRequestSchema = z.object({ path: z.string() });
export type FilesDeleteRequest = z.infer<typeof FilesDeleteRequestSchema>;

export const FilesWatchRequestSchema = z.object({ path: z.string() });
export type FilesWatchRequest = z.infer<typeof FilesWatchRequestSchema>;

export const FilesWatchResponseSchema = z.object({ watchId: z.string() });
export type FilesWatchResponse = z.infer<typeof FilesWatchResponseSchema>;

export const FilesUnwatchRequestSchema = z.object({ watchId: z.string() });
export type FilesUnwatchRequest = z.infer<typeof FilesUnwatchRequestSchema>;

export const WorkspaceGetRootResponseSchema = z.object({
  path: z.string().nullable(),
});
export type WorkspaceGetRootResponse = z.infer<typeof WorkspaceGetRootResponseSchema>;

export const FilesSearchRequestSchema = z.object({
  rootPath: z.string(),
  query: z.string(),
  maxResults: z.number().optional(),
});

export const FileAttachmentSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
});
export type FileAttachment = z.infer<typeof FileAttachmentSchema>;

// --- Agent state schema ---
export const AgentStateChangedSchema = z.object({
  state: z.enum(['idle', 'working', 'error']),
});
export type AgentStateChanged = z.infer<typeof AgentStateChangedSchema>;

// --- Quota schemas ---
export const QuotaSnapshotSchema = z.object({
  quotaType: z.string(),
  entitlementRequests: z.number(),
  usedRequests: z.number(),
  remainingPercentage: z.number(),
  overage: z.number(),
  overageAllowed: z.boolean(),
  resetDate: z.string().optional(),
});
export type QuotaSnapshot = z.infer<typeof QuotaSnapshotSchema>;

export const QuotaResultSchema = z.object({
  snapshots: z.array(QuotaSnapshotSchema),
});
export type QuotaResult = z.infer<typeof QuotaResultSchema>;

// --- Instructions schemas ---

export const InstructionsPathResponseSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  lineCount: z.number(),
  isDefault: z.boolean(),
});
export type InstructionsPathResponse = z.infer<typeof InstructionsPathResponseSchema>;

export const InstructionsSetPathRequestSchema = z.object({
  path: z.string(),
});
export type InstructionsSetPathRequest = z.infer<typeof InstructionsSetPathRequestSchema>;

export const DialogOpenFileRequestSchema = z.object({
  filters: z.array(z.object({
    name: z.string(),
    extensions: z.array(z.string()),
  })).optional(),
});
export type DialogOpenFileRequest = z.infer<typeof DialogOpenFileRequestSchema>;

export const DialogOpenFileResponseSchema = z.object({
  path: z.string().nullable(),
});
export type DialogOpenFileResponse = z.infer<typeof DialogOpenFileResponseSchema>;
