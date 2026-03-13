import { execFile as nodeExecFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { ICLIDetectionService, CLIToolStatus } from '../common/cliDetection.js';

export type ExecFileFunction = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

interface CLIToolDef {
  id: string;
  name: string;
  versionArgs: string[];
  versionPattern: RegExp;
  authArgs?: string[];
  /** If set, stdout must match this pattern for auth to be considered successful (some CLIs exit 0 even when not authenticated) */
  authSuccessPattern?: RegExp;
  installUrl: string;
  authCommand?: string;
}

const CLI_TOOLS: CLIToolDef[] = [
  {
    id: 'gh',
    name: 'GitHub CLI',
    versionArgs: ['--version'],
    versionPattern: /gh version (\d+\.\d+\.\d+)/,
    authArgs: ['auth', 'status'],
    installUrl: 'https://cli.github.com',
    authCommand: 'gh auth login',
  },
  {
    id: 'mgc',
    name: 'Microsoft Graph CLI',
    versionArgs: ['--version'],
    versionPattern: /(\d+\.\d+\.\d+)/,
    authArgs: ['me', 'get'],
    installUrl: 'https://learn.microsoft.com/en-us/graph/cli/installation',
    authCommand: 'mgc login --strategy DeviceCode',
  },
  {
    id: 'az',
    name: 'Azure CLI',
    versionArgs: ['--version'],
    versionPattern: /azure-cli\s+(\d+\.\d+\.\d+)/,
    authArgs: ['account', 'show'],
    installUrl: 'https://learn.microsoft.com/en-us/cli/azure/install-azure-cli',
    authCommand: 'az login --use-device-code',
  },
  // m365 (CLI for Microsoft 365) removed: v11 requires custom Entra app registration
  // and has a broken device code flow. Use mgc (Microsoft Graph CLI) instead —
  // it covers the same Microsoft 365 APIs without requiring app registration.
  {
    id: 'gcloud',
    name: 'Google Cloud CLI',
    versionArgs: ['--version'],
    versionPattern: /Google Cloud SDK (\d+\.\d+\.\d+)/,
    authArgs: ['auth', 'print-identity-token'],
    installUrl: 'https://cloud.google.com/sdk/docs/install',
    authCommand: 'gcloud auth login --no-browser',
  },
  {
    id: 'git',
    name: 'git',
    versionArgs: ['--version'],
    versionPattern: /git version (\d+\.\d+[\.\d]*)/,
    installUrl: 'https://git-scm.com',
  },
  {
    id: 'pandoc',
    name: 'Pandoc',
    versionArgs: ['--version'],
    versionPattern: /pandoc (\d+\.\d+[\.\d]*)/,
    installUrl: 'https://pandoc.org/installing.html',
  },
  {
    id: 'workiq',
    name: 'Work IQ',
    versionArgs: ['--version'],
    versionPattern: /(\d+\.\d+\.\d+)/,
    authArgs: ['auth', 'status'],
    installUrl: 'https://workiq.microsoft.com',
    authCommand: 'workiq auth login',
  },
];

export class CLIDetectionServiceImpl extends Disposable implements ICLIDetectionService {
  private readonly _onDidChangeTools = this._register(new Emitter<CLIToolStatus[]>());
  readonly onDidChangeTools: Event<CLIToolStatus[]> = this._onDidChangeTools.event;

  private _cache: CLIToolStatus[] | null = null;
  private readonly _execFile: ExecFileFunction;

  constructor(execFile?: ExecFileFunction) {
    super();
    this._execFile = execFile ?? (promisify(nodeExecFile) as unknown as ExecFileFunction);
  }

  async detectAll(): Promise<CLIToolStatus[]> {
    if (this._cache !== null) {
      return this._cache;
    }
    const results = await Promise.all(CLI_TOOLS.map(def => this._detectOne(def)));
    this._cache = results;
    return results;
  }

  async detect(toolId: string): Promise<CLIToolStatus | undefined> {
    const all = await this.detectAll();
    return all.find(t => t.id === toolId);
  }

  async refresh(): Promise<void> {
    this._cache = null;
    const results = await this.detectAll();
    this._onDidChangeTools.fire(results);
  }

  async installTool(toolId: string): Promise<{ success: boolean; installUrl?: string; error?: string }> {
    const def = CLI_TOOLS.find(t => t.id === toolId);
    if (!def) {
      return { success: false, error: `Unknown tool: ${toolId}` };
    }
    return { success: true, installUrl: def.installUrl };
  }

  async authenticateTool(toolId: string): Promise<{ success: boolean; error?: string; authUrl?: string; deviceCode?: string }> {
    const def = CLI_TOOLS.find(t => t.id === toolId);
    if (!def) {
      return { success: false, error: `Unknown tool: ${toolId}` };
    }
    if (!def.authCommand) {
      return { success: false, error: `No auth command for ${def.name}` };
    }
    const parts = def.authCommand.split(' ');
    try {
      // Auth commands use device code flow: they print a URL and code to stdout,
      // then block waiting for the user to complete browser auth. We start the
      // process, wait just long enough to capture the URL/code, then return
      // immediately. The process continues in the background; when it exits,
      // we refresh tool status so the UI updates.
      const child = spawn(parts[0], parts.slice(1), { shell: true, stdio: 'pipe' });
      let authUrl: string | undefined;
      let deviceCode: string | undefined;

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        const urlMatch = text.match(/(https?:\/\/\S+)/);
        if (urlMatch && !authUrl) {
          authUrl = urlMatch[1];
        }
        const codeMatch = text.match(/code\s+([A-Z0-9]{6,})/i);
        if (codeMatch && !deviceCode) {
          deviceCode = codeMatch[1];
        }
      };

      child.stdout?.on('data', handleOutput);
      child.stderr?.on('data', handleOutput);

      // Wait up to 5 seconds for the URL/code to appear in stdout
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (authUrl) {
            clearInterval(check);
            resolve();
          }
        }, 200);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });

      // Let the auth process run in the background — refresh when it completes
      child.on('close', () => {
        this._cache = null;
        void this.refresh();
      });

      // Timeout: kill after 3 minutes if user never completes auth
      setTimeout(() => { child.kill(); }, 180_000);

      return { success: true, authUrl, deviceCode };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async _detectOne(def: CLIToolDef): Promise<CLIToolStatus> {
    const status: CLIToolStatus = {
      id: def.id,
      name: def.name,
      installed: false,
      installUrl: def.installUrl,
      authCommand: def.authCommand,
    };

    try {
      const { stdout, stderr } = await this._execFile(def.id, def.versionArgs);
      const output = stdout + stderr;
      const match = def.versionPattern.exec(output);
      if (match) {
        status.installed = true;
        status.version = match[1];
      }
    } catch (err: unknown) {
      // ENOENT = not installed; any other error = treat as not installed
      return status;
    }

    if (status.installed && def.authArgs !== undefined) {
      try {
        const { stdout, stderr } = await this._execFile(def.id, def.authArgs);
        if (def.authSuccessPattern) {
          // Some CLIs exit 0 even when not authenticated — check stdout
          const output = stdout + stderr;
          status.authenticated = def.authSuccessPattern.test(output);
        } else {
          status.authenticated = true;
        }
      } catch {
        status.authenticated = false;
      }
    }

    return status;
  }
}
