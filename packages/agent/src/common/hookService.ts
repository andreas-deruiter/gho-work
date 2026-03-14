import type { IDisposable } from '@gho-work/base';

export interface HookMatcher {
  matcher?: string; // regex pattern for tool name matching
  hooks: HookAction[];
}

export interface HookAction {
  type: 'command';
  command: string;
  timeout?: number; // ms, default 30000
}

export interface HookContext {
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  [key: string]: unknown;
}

export interface IHookService extends IDisposable {
  registerHooks(pluginName: string, pluginRoot: string, hooks: Record<string, HookMatcher[]>): void;
  unregisterHooks(pluginName: string): void;
  fire(event: string, context: HookContext): Promise<void>;
}
