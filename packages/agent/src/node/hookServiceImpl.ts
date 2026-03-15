import { execFile as _execFile } from 'node:child_process';
import { expandPluginRoot } from '@gho-work/base';
import type { HookMatcher, HookContext, IHookService } from '../common/hookService';

type ExecFileFn = typeof _execFile;

interface RegisteredHook {
  pluginName: string;
  pluginRoot: string;
  event: string;
  matcher?: RegExp;
  type: 'command';
  command: string;
  timeout: number;
}

const DEFAULT_TIMEOUT = 30_000;

export class HookServiceImpl implements IHookService {
  private readonly _hooks: RegisteredHook[] = [];
  private readonly _execFile: ExecFileFn;

  constructor(execFileFn: ExecFileFn = _execFile) {
    this._execFile = execFileFn;
  }

  registerHooks(
    pluginName: string,
    pluginRoot: string,
    hooks: Record<string, HookMatcher[]>,
  ): void {
    for (const [event, matchers] of Object.entries(hooks)) {
      for (const matcherDef of matchers) {
        for (const action of matcherDef.hooks) {
          this._hooks.push({
            pluginName,
            pluginRoot,
            event,
            matcher: matcherDef.matcher ? this._safeRegex(matcherDef.matcher, pluginName) : undefined,
            type: action.type,
            command: action.command,
            timeout: action.timeout ?? DEFAULT_TIMEOUT,
          });
        }
      }
    }
  }

  unregisterHooks(pluginName: string): void {
    for (let i = this._hooks.length - 1; i >= 0; i--) {
      if (this._hooks[i].pluginName === pluginName) {
        this._hooks.splice(i, 1);
      }
    }
  }

  async fire(event: string, context: HookContext): Promise<void> {
    const matching = this._hooks.filter((h) => {
      if (h.event !== event) return false;
      if (h.matcher && context.toolName && !h.matcher.test(context.toolName)) return false;
      return true;
    });

    for (const hook of matching) {
      try {
        await this._executeCommand(hook, context);
      } catch (err) {
        console.warn(`[HookService] Hook from ${hook.pluginName} failed:`, err);
      }
    }
  }

  private _safeRegex(pattern: string, pluginName: string): RegExp | undefined {
    try {
      return new RegExp(pattern);
    } catch (err) {
      console.warn(`[HookService] Invalid matcher regex from ${pluginName}: ${pattern}`);
      return undefined;
    }
  }

  private _executeCommand(hook: RegisteredHook, context: HookContext): Promise<void> {
    return new Promise((resolve) => {
      const command = expandPluginRoot(hook.command, hook.pluginRoot);
      const child = this._execFile(
        '/bin/sh',
        ['-c', command],
        { timeout: hook.timeout },
        (err) => {
          if (err) {
            console.warn(`[HookService] ${hook.pluginName}: ${command} failed:`, err.message);
          }
          resolve();
        },
      );

      // Pass context as JSON on stdin
      if (child.stdin) {
        child.stdin.write(JSON.stringify(context));
        child.stdin.end();
      }
    });
  }

  dispose(): void {
    this._hooks.length = 0;
  }
}
