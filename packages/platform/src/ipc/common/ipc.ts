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
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_STATE: 'auth:state',
  AUTH_STATE_CHANGED: 'auth:state-changed',
  STORAGE_GET: 'storage:get',
  STORAGE_SET: 'storage:set',
  PORT_AGENT_HOST: 'port:agent-host',
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
  z.object({ type: z.literal('permission_request'), toolCall: ToolCallPartialSchema }),
  z.object({ type: z.literal('error'), error: z.string() }),
  z.object({ type: z.literal('done'), messageId: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

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
