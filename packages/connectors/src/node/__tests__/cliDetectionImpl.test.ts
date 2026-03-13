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
  // authenticateTool uses spawn (not execFile) for device code flow.
  // Only edge cases testable via execFile mock:

  it('returns error for unknown tool', async () => {
    const mockExec: ExecFileFunction = vi.fn();
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.authenticateTool('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unknown/i);
  });

  it('returns error for tool without auth command', async () => {
    const mockExec: ExecFileFunction = vi.fn();
    const service = new CLIDetectionServiceImpl(mockExec);
    const result = await service.authenticateTool('pandoc');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no auth/i);
  });
});
