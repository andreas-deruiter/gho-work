import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HookServiceImpl } from '../node/hookServiceImpl';

describe('HookServiceImpl', () => {
  let service: HookServiceImpl;

  afterEach(() => {
    service.dispose();
    vi.restoreAllMocks();
  });

  describe('registration', () => {
    beforeEach(() => {
      service = new HookServiceImpl();
    });

    it('registers hooks for a plugin', () => {
      service.registerHooks('my-plugin', '/plugin/root', {
        PostToolUse: [
          {
            matcher: 'Write|Edit',
            hooks: [{ type: 'command', command: '/plugin/root/lint.sh' }],
          },
        ],
      });
      // No error = success
    });

    it('unregisters hooks for a plugin', () => {
      service.registerHooks('my-plugin', '/plugin/root', {
        PostToolUse: [
          {
            hooks: [{ type: 'command', command: 'echo test' }],
          },
        ],
      });
      service.unregisterHooks('my-plugin');
      // verify by firing — should not execute
    });
  });

  describe('firing', () => {
    it('executes command hooks on matching event', async () => {
      const mockExecFile = vi.fn((cmd: any, args: any, opts: any, cb: any) => {
        cb(null, 'ok', '');
        return { stdin: { write: vi.fn(), end: vi.fn() } } as any;
      });

      service = new HookServiceImpl(mockExecFile as any);

      service.registerHooks('linter', '/plugins/linter', {
        PostToolUse: [
          {
            hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/lint.sh' }],
          },
        ],
      });

      await service.fire('PostToolUse', { toolName: 'Write', toolInput: {}, toolResult: '' });
      expect(mockExecFile).toHaveBeenCalled();
      const [, args] = mockExecFile.mock.calls[0];
      expect((args as string[])[1]).toBe('/plugins/linter/lint.sh');
    });

    it('only fires hooks with matching tool name', async () => {
      const mockExecFile = vi.fn((cmd: any, args: any, opts: any, cb: any) => {
        cb(null, '', '');
        return { stdin: { write: vi.fn(), end: vi.fn() } } as any;
      });

      service = new HookServiceImpl(mockExecFile as any);

      service.registerHooks('linter', '/plugins/linter', {
        PostToolUse: [
          {
            matcher: 'Write|Edit',
            hooks: [{ type: 'command', command: 'lint.sh' }],
          },
        ],
      });

      await service.fire('PostToolUse', { toolName: 'Read', toolInput: {}, toolResult: '' });
      expect(mockExecFile).not.toHaveBeenCalled();

      await service.fire('PostToolUse', { toolName: 'Write', toolInput: {}, toolResult: '' });
      expect(mockExecFile).toHaveBeenCalled();
    });

    it('does not throw on hook failure', async () => {
      const mockExecFile = vi.fn((cmd: any, args: any, opts: any, cb: any) => {
        cb(new Error('script crashed'), '', 'error output');
        return { stdin: { write: vi.fn(), end: vi.fn() } } as any;
      });

      service = new HookServiceImpl(mockExecFile as any);

      service.registerHooks('buggy', '/plugins/buggy', {
        PostToolUse: [
          {
            hooks: [{ type: 'command', command: 'bad.sh' }],
          },
        ],
      });

      await expect(
        service.fire('PostToolUse', { toolName: 'Write', toolInput: {}, toolResult: '' }),
      ).resolves.not.toThrow();
    });
  });
});
