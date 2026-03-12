import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLIDetectionServiceImpl, type ExecFileFunction } from '../node/cliDetectionImpl.js';

function makeExecFile(responses: Record<string, Record<string, { stdout: string; stderr: string } | Error>>): ExecFileFunction {
  return async (cmd: string, args: string[]) => {
    const key = args.join(' ');
    const cmdResponses = responses[cmd];
    if (!cmdResponses) {
      const err = new Error(`ENOENT: ${cmd} not found`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    const response = cmdResponses[key];
    if (!response) {
      const err = new Error(`ENOENT: ${cmd} not found`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    if (response instanceof Error) {
      throw response;
    }
    return response;
  };
}

describe('CLIDetectionServiceImpl', () => {
  describe('detectAll', () => {
    it('returns 6 tools with correct ids', async () => {
      const execFile = makeExecFile({});
      const svc = new CLIDetectionServiceImpl(execFile);
      const results = await svc.detectAll();
      expect(results).toHaveLength(6);
      const ids = results.map(r => r.id);
      expect(ids).toEqual(['gh', 'mgc', 'az', 'gcloud', 'pandoc', 'workiq']);
      svc.dispose();
    });

    it('returns correct names and installUrls', async () => {
      const execFile = makeExecFile({});
      const svc = new CLIDetectionServiceImpl(execFile);
      const results = await svc.detectAll();
      const gh = results.find(r => r.id === 'gh')!;
      expect(gh.name).toBe('GitHub CLI');
      expect(gh.installUrl).toBe('https://cli.github.com');
      expect(gh.authCommand).toBe('gh auth login');

      const pandoc = results.find(r => r.id === 'pandoc')!;
      expect(pandoc.installUrl).toBe('https://pandoc.org/installing.html');
      expect(pandoc.authCommand).toBeUndefined();
      svc.dispose();
    });
  });

  describe('installed CLI tool', () => {
    it('gh: detects version when installed', async () => {
      const execFile = makeExecFile({
        gh: {
          '--version': { stdout: 'gh version 2.45.0 (2024-02-05)\nhttps://github.com/cli/cli/releases/tag/v2.45.0\n', stderr: '' },
          'auth status': { stdout: '', stderr: 'Logged in to github.com as user' },
        },
      });
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('gh');
      expect(result?.installed).toBe(true);
      expect(result?.version).toBe('2.45.0');
      svc.dispose();
    });

    it('az: detects version with azure-cli pattern', async () => {
      const execFile = makeExecFile({
        az: {
          '--version': { stdout: 'azure-cli                         2.57.0\ncore                              2.57.0\n', stderr: '' },
          'account show': { stdout: '{}', stderr: '' },
        },
      });
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('az');
      expect(result?.installed).toBe(true);
      expect(result?.version).toBe('2.57.0');
      svc.dispose();
    });

    it('gcloud: detects version with Google Cloud SDK pattern', async () => {
      const execFile = makeExecFile({
        gcloud: {
          '--version': { stdout: 'Google Cloud SDK 460.0.0\nbq 2.0.101\n', stderr: '' },
          'auth print-identity-token': { stdout: 'ya29.token', stderr: '' },
        },
      });
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('gcloud');
      expect(result?.installed).toBe(true);
      expect(result?.version).toBe('460.0.0');
      svc.dispose();
    });

    it('pandoc: detects version, no authenticated field', async () => {
      const execFile = makeExecFile({
        pandoc: {
          '--version': { stdout: 'pandoc 3.1.9\nCompiled with pandoc-types 1.23.1\n', stderr: '' },
        },
      });
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('pandoc');
      expect(result?.installed).toBe(true);
      expect(result?.version).toBe('3.1.9');
      expect(result?.authenticated).toBeUndefined();
      svc.dispose();
    });
  });

  describe('missing CLI tool', () => {
    it('returns installed: false when ENOENT', async () => {
      const execFile = makeExecFile({});
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('gh');
      expect(result?.installed).toBe(false);
      expect(result?.version).toBeUndefined();
      svc.dispose();
    });

    it('returns installed: false for all missing tools in detectAll', async () => {
      const execFile = makeExecFile({});
      const svc = new CLIDetectionServiceImpl(execFile);
      const results = await svc.detectAll();
      for (const r of results) {
        expect(r.installed).toBe(false);
      }
      svc.dispose();
    });
  });

  describe('auth checks', () => {
    it('authenticated: true when auth command succeeds', async () => {
      const execFile = makeExecFile({
        gh: {
          '--version': { stdout: 'gh version 2.45.0 (2024-02-05)\n', stderr: '' },
          'auth status': { stdout: '', stderr: 'Logged in to github.com as user' },
        },
      });
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('gh');
      expect(result?.authenticated).toBe(true);
      svc.dispose();
    });

    it('authenticated: false when auth command throws', async () => {
      const authError = new Error('not logged in');
      const execFile = makeExecFile({
        gh: {
          '--version': { stdout: 'gh version 2.45.0 (2024-02-05)\n', stderr: '' },
          'auth status': authError,
        },
      });
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('gh');
      expect(result?.installed).toBe(true);
      expect(result?.authenticated).toBe(false);
      svc.dispose();
    });

    it('authenticated: false when auth command exits with error code', async () => {
      const authError = new Error('exit code 1') as NodeJS.ErrnoException;
      (authError as any).code = 1;
      const execFile = makeExecFile({
        mgc: {
          '--version': { stdout: '1.0.0\n', stderr: '' },
          'me show': authError,
        },
      });
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('mgc');
      expect(result?.installed).toBe(true);
      expect(result?.authenticated).toBe(false);
      svc.dispose();
    });

    it('pandoc: no auth check, authenticated stays undefined', async () => {
      const execFile = makeExecFile({
        pandoc: {
          '--version': { stdout: 'pandoc 3.1.9\n', stderr: '' },
        },
      });
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('pandoc');
      expect(result?.installed).toBe(true);
      expect(result?.authenticated).toBeUndefined();
      svc.dispose();
    });
  });

  describe('detect(toolId)', () => {
    it('returns the specific tool status', async () => {
      const execFile = makeExecFile({});
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('gh');
      expect(result).toBeDefined();
      expect(result!.id).toBe('gh');
      svc.dispose();
    });

    it('returns undefined for unknown toolId', async () => {
      const execFile = makeExecFile({});
      const svc = new CLIDetectionServiceImpl(execFile);
      const result = await svc.detect('nonexistent');
      expect(result).toBeUndefined();
      svc.dispose();
    });
  });

  describe('caching', () => {
    it('detectAll returns cached results on second call', async () => {
      let callCount = 0;
      const execFile: ExecFileFunction = async (cmd, args) => {
        callCount++;
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      };
      const svc = new CLIDetectionServiceImpl(execFile);
      await svc.detectAll();
      const firstCallCount = callCount;
      await svc.detectAll();
      expect(callCount).toBe(firstCallCount); // no additional calls
      svc.dispose();
    });
  });

  describe('refresh()', () => {
    it('clears the cache and re-detects', async () => {
      let callCount = 0;
      const execFile: ExecFileFunction = async (cmd, args) => {
        callCount++;
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      };
      const svc = new CLIDetectionServiceImpl(execFile);
      await svc.detectAll();
      const afterFirst = callCount;
      await svc.refresh();
      expect(callCount).toBeGreaterThan(afterFirst); // re-ran detections
      svc.dispose();
    });

    it('fires onDidChangeTools after refresh', async () => {
      const execFile = makeExecFile({});
      const svc = new CLIDetectionServiceImpl(execFile);
      const fired: any[] = [];
      svc.onDidChangeTools(tools => fired.push(tools));
      await svc.refresh();
      expect(fired).toHaveLength(1);
      expect(fired[0]).toHaveLength(6);
      svc.dispose();
    });

    it('does not fire onDidChangeTools on detectAll (only on refresh)', async () => {
      const execFile = makeExecFile({});
      const svc = new CLIDetectionServiceImpl(execFile);
      const fired: any[] = [];
      svc.onDidChangeTools(tools => fired.push(tools));
      await svc.detectAll();
      expect(fired).toHaveLength(0);
      svc.dispose();
    });
  });
});
