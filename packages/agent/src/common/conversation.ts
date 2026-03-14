import { createServiceIdentifier } from '@gho-work/base';
import type { Conversation, Message, ToolCall } from '@gho-work/base';

export interface IConversationService {
  listConversations(): Conversation[];
  getConversation(id: string): Conversation | undefined;
  createConversation(model: string): Conversation;
  createConversationWithId(id: string, model: string): Conversation;
  renameConversation(id: string, title: string): void;
  deleteConversation(id: string): void;
  archiveConversation(id: string): void;
  addMessage(conversationId: string, message: Omit<Message, 'id'>): Message;
  getMessages(conversationId: string): Message[];
  addToolCall(messageId: string, conversationId: string, toolCall: Omit<ToolCall, 'id'>): ToolCall;
  updateToolCall(id: string, update: Partial<Pick<ToolCall, 'result' | 'status' | 'durationMs'>>): void;
  getToolCalls(conversationId: string): ToolCall[];
}

export const IConversationService = createServiceIdentifier<IConversationService>('IConversationService');
