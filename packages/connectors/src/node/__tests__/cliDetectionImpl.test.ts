import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLIDetectionServiceImpl } from '../cliDetectionImpl.js';
import type { ExecFileFunction } from '../cliDetectionImpl.js';

describe('CLIDetectionServiceImpl.installTool', () => {
  it('returns the installUrl for a known tool', async () => {
    const mockExec: ExecFileFunction = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.installTool('gh');
    expect(result.success).toBe(true);
    expect(result.installUrl).toBe('https://cli.github.com');
  });

  it('returns error for unknown tool', async () => {
    const mockExec: ExecFileFunction = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.installTool('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unknown/i);
  });
});

describe('CLIDetectionServiceImpl.authenticateTool', () => {
  it('runs auth command and returns success', async () => {
    const mockExec: ExecFileFunction = vi.fn().mockResolvedValue({ stdout: 'OK', stderr: '' });
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.authenticateTool('gh');
    expect(result.success).toBe(true);
    expect(mockExec).toHaveBeenCalledWith('gh', ['auth', 'login']);
  });

  it('returns error when auth command fails', async () => {
    const mockExec: ExecFileFunction = vi.fn().mockRejectedValue(new Error('auth failed'));
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.authenticateTool('gh');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/auth failed/);
  });

  it('returns error for tool without auth command', async () => {
    const mockExec: ExecFileFunction = vi.fn();
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.authenticateTool('pandoc');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no auth/i);
  });
});
